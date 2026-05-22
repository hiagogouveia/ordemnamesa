import "server-only"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe/server"
import { supabaseAdmin } from "@/lib/admin-leads-control-hub/supabase-admin"
import { stripeLog } from "@/lib/stripe/log"
import type { SubscriptionStatus, BillingCycle } from "@/lib/billing/types"

/**
 * Mapeia o vocabulário de status do Stripe para o nosso enum.
 * Stripe é a fonte de verdade — o banco é espelho.
 */
function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
    switch (s) {
        case "trialing":
            return "trial"
        case "active":
            return "active"
        case "past_due":
            return "past_due"
        case "canceled":
            return "canceled"
        case "unpaid":
            return "unpaid"
        case "incomplete":
        case "incomplete_expired":
        case "paused":
        default:
            return "incomplete"
    }
}

/** Descobre a account dona desta subscription, sem confiar no client. */
async function resolveAccountId(sub: Stripe.Subscription): Promise<string | null> {
    const fromMeta = sub.metadata?.account_id
    if (fromMeta) return fromMeta

    // Fallback: linha já vinculada a esta subscription ou ao customer.
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
    const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("account_id")
        .or(
            [
                `stripe_subscription_id.eq.${sub.id}`,
                customerId ? `stripe_customer_id.eq.${customerId}` : "",
            ]
                .filter(Boolean)
                .join(",")
        )
        .limit(1)
        .maybeSingle<{ account_id: string }>()
    return data?.account_id ?? null
}

/** Resolve plan_id e ciclo a partir do price da subscription. */
async function resolvePlanFromSub(
    sub: Stripe.Subscription
): Promise<{ plan_id: string; billing_cycle: BillingCycle } | null> {
    const item = sub.items?.data?.[0]
    const priceId = item?.price?.id
    if (!priceId) return null

    const billing_cycle: BillingCycle =
        item.price.recurring?.interval === "year" ? "yearly" : "monthly"

    const { data } = await supabaseAdmin
        .from("plans")
        .select("id")
        .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
        .limit(1)
        .maybeSingle<{ id: string }>()

    if (!data) return null
    return { plan_id: data.id, billing_cycle }
}

/**
 * Sincroniza UMA subscription do Stripe para a tabela `subscriptions` (espelho).
 * Atualiza a linha viva da account (respeita o índice 1-viva-por-account).
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
    const accountId = await resolveAccountId(sub)
    if (!accountId) {
        stripeLog.warn({
            op: "webhook",
            event: "sync",
            stripe_subscription_id: sub.id,
            msg: "account não resolvida — ignorando",
        })
        return
    }

    const plan = await resolvePlanFromSub(sub)
    if (!plan) {
        stripeLog.warn({
            op: "webhook",
            event: "sync",
            account_id: accountId,
            stripe_subscription_id: sub.id,
            msg: "plano não resolvido pelo price — ignorando",
        })
        return
    }

    const status = mapStripeStatus(sub.status)
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null

    // current_period_end migrou para o item na apiVersion atual; fallback para o campo legado.
    const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined
    const periodEnd =
        item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end
    const endsAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null
    const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null

    const patch = {
        plan_id: plan.plan_id,
        billing_cycle: plan.billing_cycle,
        status,
        ends_at: endsAt,
        canceled_at: canceledAt,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        updated_at: new Date().toISOString(),
    }

    // Alvo: linha já ligada a esta subscription; senão a linha viva da account.
    const { data: bound } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .limit(1)
        .maybeSingle<{ id: string }>()

    let targetId = bound?.id ?? null
    if (!targetId) {
        const { data: live } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("account_id", accountId)
            .in("status", ["trial", "active", "past_due"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ id: string }>()
        targetId = live?.id ?? null
    }

    if (targetId) {
        const { error } = await supabaseAdmin.from("subscriptions").update(patch).eq("id", targetId)
        if (error) throw new Error(`update subscriptions ${targetId}: ${error.message}`)
    } else {
        const { error } = await supabaseAdmin
            .from("subscriptions")
            .insert({ account_id: accountId, started_at: new Date().toISOString(), ...patch })
        if (error) throw new Error(`insert subscription (account ${accountId}): ${error.message}`)
    }

    stripeLog.info({
        op: "webhook",
        event: "sync",
        account_id: accountId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        status,
        msg: `cycle=${plan.billing_cycle}`,
    })
}

/** Busca a subscription completa no Stripe a partir de um id e sincroniza. */
async function syncSubscriptionById(subscriptionId: string): Promise<void> {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    await syncSubscription(sub)
}

/**
 * Dispatcher dos eventos tratados. Cada handler é idempotente
 * (a idempotência de reentrega já é garantida na rota via stripe_events).
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session
            const subId =
                typeof session.subscription === "string"
                    ? session.subscription
                    : session.subscription?.id
            if (subId) await syncSubscriptionById(subId)
            break
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
            // Out-of-order safety: o payload pode estar desatualizado se eventos
            // chegam fora de ordem. deleted é terminal e não pode ser re-buscado
            // (retrieve de sub cancelada ainda funciona, mas usamos o objeto para
            // garantir o status canceled mesmo após expurgo). Demais: estado fresco.
            const obj = event.data.object as Stripe.Subscription
            if (event.type === "customer.subscription.deleted") {
                await syncSubscription(obj)
            } else {
                await syncSubscriptionById(obj.id)
            }
            break
        }
        case "invoice.paid":
        case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice
            const subId =
                typeof (invoice as unknown as { subscription?: string | { id: string } }).subscription ===
                "string"
                    ? (invoice as unknown as { subscription: string }).subscription
                    : (invoice as unknown as { subscription?: { id: string } }).subscription?.id
            if (subId) await syncSubscriptionById(subId)
            break
        }
        default:
            // Evento não tratado — ignorado de propósito (logado na rota).
            break
    }
}
