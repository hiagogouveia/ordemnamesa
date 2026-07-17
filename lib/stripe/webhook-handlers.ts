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

/**
 * Classifica o status CRU do Stripe para as regras de bind/rebind do espelho.
 * O mapStripeStatus colapsa incomplete/incomplete_expired — aqui a distinção
 * importa: um boleto pendente (incomplete) e um boleto vencido
 * (incomplete_expired) exigem tratamentos opostos sobre a linha viva.
 *
 * - live:    a subscription é a verdade atual da conta — pode (re)assumir a linha viva.
 * - pending: 1ª fatura aguardando pagamento (boleto/SCA) — nunca rebaixa trial/active.
 * - dead:    estado terminal — só pode atualizar a linha JÁ vinculada a ela (A1).
 */
type StripeStatusClass = "live" | "pending" | "dead"

function classifyStripeStatus(s: Stripe.Subscription.Status): StripeStatusClass {
    switch (s) {
        case "trialing":
        case "active":
        case "past_due":
            return "live"
        case "canceled":
        case "incomplete_expired":
        case "unpaid":
            return "dead"
        case "incomplete":
        case "paused":
        default:
            return "pending"
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

    const statusClass = classifyStripeStatus(sub.status)

    const applyUpdate = async (targetId: string, fields: Record<string, unknown>) => {
        const { error } = await supabaseAdmin.from("subscriptions").update(fields).eq("id", targetId)
        if (error) throw new Error(`update subscriptions ${targetId}: ${error.message}`)
    }

    // Alvo 1: linha já vinculada a esta subscription.
    const { data: bound } = await supabaseAdmin
        .from("subscriptions")
        .select("id, status")
        .eq("stripe_subscription_id", sub.id)
        .limit(1)
        .maybeSingle<{ id: string; status: SubscriptionStatus }>()

    if (bound) {
        // Guard do trial: linha trial vinculada = tentativa de pagamento (boleto)
        // pendente. O trial NUNCA é rebaixado por um desfecho não-pago.
        if (bound.status === "trial" && statusClass !== "live") {
            if (statusClass === "dead") {
                // Boleto vencido/tentativa cancelada: desfaz o vínculo e preserva o
                // trial — libera a linha para a próxima tentativa de checkout.
                await applyUpdate(bound.id, {
                    stripe_subscription_id: null,
                    updated_at: patch.updated_at,
                })
                stripeLog.info({
                    op: "webhook",
                    event: "sync",
                    account_id: accountId,
                    stripe_subscription_id: sub.id,
                    status,
                    msg: "tentativa pendente morreu — unbind, trial preservado",
                })
                return
            }
            // pending: só refresca o vínculo, sem tocar o status do trial.
            await applyUpdate(bound.id, {
                stripe_customer_id: customerId,
                stripe_subscription_id: sub.id,
                updated_at: patch.updated_at,
            })
            return
        }
        await applyUpdate(bound.id, patch)
        stripeLog.info({
            op: "webhook",
            event: "sync",
            account_id: accountId,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            status,
            msg: `cycle=${plan.billing_cycle}`,
        })
        return
    }

    // Alvo 2: linha viva da account (ainda não vinculada a esta subscription).
    const { data: live } = await supabaseAdmin
        .from("subscriptions")
        .select("id, status, stripe_subscription_id")
        .eq("account_id", accountId)
        .in("status", ["trial", "active", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; status: SubscriptionStatus; stripe_subscription_id: string | null }>()

    if (live) {
        if (statusClass === "dead") {
            // A1: subscription morta nunca sobrescreve a linha viva de OUTRA
            // subscription (ex.: dunning cancela sub antiga semanas após a conta
            // já ter reassinado — o deleted chegaria aqui e apagaria o active).
            stripeLog.warn({
                op: "webhook",
                event: "sync",
                account_id: accountId,
                stripe_subscription_id: sub.id,
                status,
                msg: "sub morta sem vínculo — ignorada (linha viva preservada)",
            })
            return
        }
        if (statusClass === "pending") {
            if (live.status === "trial") {
                // Guard do trial (1ª vinculação): boleto pendente não rebaixa o
                // trial — vincula a linha e espera o desfecho do pagamento.
                await applyUpdate(live.id, {
                    stripe_customer_id: customerId,
                    stripe_subscription_id: sub.id,
                    updated_at: patch.updated_at,
                })
                stripeLog.info({
                    op: "webhook",
                    event: "sync",
                    account_id: accountId,
                    stripe_customer_id: customerId,
                    stripe_subscription_id: sub.id,
                    status,
                    msg: "pagamento pendente — vínculo criado, trial preservado",
                })
                return
            }
            // Conta active/past_due não é rebaixada por um checkout incompleto.
            stripeLog.warn({
                op: "webhook",
                event: "sync",
                account_id: accountId,
                stripe_subscription_id: sub.id,
                status,
                msg: "sub pendente ignorada — linha viva não é trial",
            })
            return
        }
        // live: rebind legítimo (estado re-buscado do Stripe é a verdade atual).
        const previousSubId = live.stripe_subscription_id
        await applyUpdate(live.id, patch)
        if (previousSubId && previousSubId !== sub.id) {
            // A2: a linha viva trocou de subscription — a anterior pode continuar
            // viva no Stripe (dupla cobrança). Cancela best-effort.
            await cancelDuplicateSubscription(previousSubId, accountId, sub.id)
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
        return
    }

    // Alvo 3: account sem linha viva (ex.: canceled reassinando).
    if (statusClass === "dead") {
        stripeLog.warn({
            op: "webhook",
            event: "sync",
            account_id: accountId,
            stripe_subscription_id: sub.id,
            status,
            msg: "sub morta sem linha correspondente — ignorada",
        })
        return
    }
    const { error } = await supabaseAdmin
        .from("subscriptions")
        .insert({ account_id: accountId, started_at: new Date().toISOString(), ...patch })
    if (error) throw new Error(`insert subscription (account ${accountId}): ${error.message}`)

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

/**
 * A2 — dupla cobrança: quando a linha viva rebinda para uma subscription nova,
 * a antiga pode continuar viva no Stripe (usuário pagou dois boletos, ou pagou
 * um boleto antigo depois de já ter assinado no cartão). Cancela a antiga.
 * Best-effort: falha aqui NÃO derruba o sync (o espelho já está correto);
 * o log de erro fica como trilha para ação manual (refund de boleto é manual).
 */
async function cancelDuplicateSubscription(
    orphanSubId: string,
    accountId: string,
    keptSubId: string
): Promise<void> {
    try {
        const stripe = getStripe()
        const orphan = await stripe.subscriptions.retrieve(orphanSubId)
        if (classifyStripeStatus(orphan.status) === "dead") return
        await stripe.subscriptions.cancel(orphanSubId)
        stripeLog.error({
            op: "webhook",
            event: "duplicate_subscription_canceled",
            account_id: accountId,
            stripe_subscription_id: orphanSubId,
            msg: `sub duplicada cancelada — mantida ${keptSubId}; verificar necessidade de refund`,
        })
    } catch (err) {
        stripeLog.error({
            op: "webhook",
            event: "duplicate_subscription_cancel_failed",
            account_id: accountId,
            stripe_subscription_id: orphanSubId,
            msg: `falha ao cancelar sub duplicada (mantida ${keptSubId}): ${(err as Error).message}`,
        })
    }
}

/**
 * Extrai o subscription id de um Invoice cobrindo as duas gerações de payload:
 * `invoice.subscription` (legado) e `invoice.parent.subscription_details.subscription`
 * (apiVersions pós-Basil, incluindo a dahlia fixada em lib/stripe/server.ts).
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const inv = invoice as unknown as {
        subscription?: string | { id: string }
        parent?: { subscription_details?: { subscription?: string | { id: string } } }
    }
    const raw = inv.subscription ?? inv.parent?.subscription_details?.subscription
    if (!raw) return null
    return typeof raw === "string" ? raw : raw.id ?? null
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
        // async_payment_*: desfecho de métodos assíncronos (boleto). Redundantes
        // para o espelho (subscription.updated também dispara), mas reduzem a
        // latência de liberação/bloqueio e não dependem de ordem de entrega —
        // todos re-buscam o estado fresco da subscription.
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
        case "checkout.session.async_payment_failed": {
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
            const subId = extractInvoiceSubscriptionId(invoice)
            if (subId) {
                await syncSubscriptionById(subId)
            } else {
                stripeLog.warn({
                    op: "webhook",
                    event: event.type,
                    msg: `invoice ${invoice.id} sem subscription id extraível — sync ignorado`,
                })
            }
            break
        }
        default:
            // Evento não tratado — ignorado de propósito (logado na rota).
            break
    }
}
