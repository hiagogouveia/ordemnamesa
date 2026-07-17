import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { listUserAccountIds } from "@/lib/supabase/accounts"
import { getStripe } from "@/lib/stripe/server"
import { stripeLog } from "@/lib/stripe/log"
import type { BillingCycle, PlanCode } from "@/lib/billing/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const VALID_CODES: PlanCode[] = ["A", "B", "C", "D"]
const VALID_CYCLES: BillingCycle[] = ["monthly", "yearly"]

type PromoFailure = { reason: string; message: string; status: number }
type PromoSuccess = { promoId: string }

/**
 * Resolve um promotion code (string digitada pelo usuário) para o ID Stripe
 * e valida regras de uso. Retorna {promoId} OU {reason,message,status} amigável.
 *
 * Defesa em profundidade: a chamada subscriptions.update ainda pode falhar
 * (ex.: race de redemption), mas pré-validar dá mensagens claras na maioria dos casos.
 */
async function resolveAndValidatePromo(
    stripe: Stripe,
    codeRaw: string,
    subscription: Stripe.Subscription
): Promise<PromoSuccess | PromoFailure> {
    const code = codeRaw.trim()
    if (!code) return { reason: "invalid_code", message: "Código não encontrado.", status: 422 }

    // Stripe lookup é case-insensitive; passamos como digitado (sem normalizar agressivo).
    const list = await stripe.promotionCodes.list({ code, active: true, limit: 1 })
    const promo = list.data[0]
    if (!promo) return { reason: "invalid_code", message: "Código não encontrado.", status: 422 }

    if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
        return { reason: "expired", message: "Código expirado.", status: 422 }
    }
    if (promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions) {
        return { reason: "exhausted", message: "Código esgotado.", status: 422 }
    }
    const subCustomer =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
    if (promo.customer && promo.customer !== subCustomer) {
        return {
            reason: "not_for_this_account",
            message: "Este código não está disponível para sua conta.",
            status: 422,
        }
    }
    if (promo.restrictions?.first_time_transaction) {
        return {
            reason: "first_time_only",
            message: "Código válido apenas para nova assinatura.",
            status: 422,
        }
    }
    // Currency mismatch fica para o catch do execute (Stripe rejeita com mensagem clara em runtime).
    return { promoId: promo.id }
}

/**
 * POST /api/stripe/change-plan
 *
 * Troca o plano/ciclo de uma assinatura ATIVA via Stripe (subscriptions.update).
 * - price_id e account_id resolvidos server-side (client manda só plan_code+cycle).
 * - Proration é do Stripe (proration_behavior), não calculada por nós.
 * - O banco NÃO é alterado aqui: a mudança volta por customer.subscription.updated → webhook.
 *
 * Só para assinaturas ATIVAS. Sem assinatura ativa → 409 (frontend usa checkout).
 */
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization")
        if (!authHeader) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
        const token = authHeader.replace("Bearer ", "")
        const admin = getAdminSupabase()

        const {
            data: { user },
            error: userError,
        } = await admin.auth.getUser(token)
        if (userError || !user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })

        const body = (await request.json().catch(() => ({}))) as {
            plan_code?: string
            cycle?: string
            account_id?: string
            promotion_code?: string
        }
        const planCode = body.plan_code as PlanCode
        const cycle = body.cycle as BillingCycle
        if (!VALID_CODES.includes(planCode) || !VALID_CYCLES.includes(cycle)) {
            return NextResponse.json(
                { error: "plan_code (A-D) e cycle (monthly|yearly) são obrigatórios." },
                { status: 400 }
            )
        }

        const accountIds = await listUserAccountIds(admin, user.id)
        if (accountIds.length === 0) {
            return NextResponse.json({ error: "Usuário não pertence a nenhuma account." }, { status: 404 })
        }
        let accountId: string
        if (accountIds.length === 1) {
            accountId = accountIds[0]
        } else {
            const requested = body.account_id ?? request.headers.get("x-account-id") ?? null
            if (!requested) return NextResponse.json({ error: "Múltiplas accounts. Informe account_id." }, { status: 400 })
            if (!accountIds.includes(requested)) {
                return NextResponse.json({ error: "Account não pertence ao usuário." }, { status: 403 })
            }
            accountId = requested
        }

        // Guard owner-only: apenas owner ativo da account pode trocar plano.
        const { data: ownerCheck } = await admin
            .from("account_users")
            .select("role, active")
            .eq("account_id", accountId)
            .eq("user_id", user.id)
            .maybeSingle<{ role: string; active: boolean }>()
        if (!ownerCheck || !ownerCheck.active || ownerCheck.role !== "owner") {
            return NextResponse.json(
                { error: "Apenas o proprietário da conta pode gerenciar billing.", code: "forbidden_billing" },
                { status: 403 }
            )
        }

        // Precisa de assinatura ATIVA com subscription Stripe.
        const { data: sub } = await admin
            .from("subscriptions")
            .select("stripe_subscription_id, status")
            .eq("account_id", accountId)
            .eq("status", "active")
            .not("stripe_subscription_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ stripe_subscription_id: string | null; status: string }>()

        if (!sub?.stripe_subscription_id) {
            return NextResponse.json(
                { error: "Sem assinatura ativa. Use o checkout para assinar.", reason: "no_active_subscription" },
                { status: 409 }
            )
        }

        // Resolve o price alvo server-side.
        const { data: plan } = await admin
            .from("plans")
            .select("stripe_price_id_monthly, stripe_price_id_yearly")
            .eq("code", planCode)
            .eq("active", true)
            .maybeSingle<{ stripe_price_id_monthly: string | null; stripe_price_id_yearly: string | null }>()
        const targetPrice = cycle === "yearly" ? plan?.stripe_price_id_yearly : plan?.stripe_price_id_monthly
        if (!targetPrice) {
            return NextResponse.json({ error: "Plano sem price configurado." }, { status: 422 })
        }

        const stripe = getStripe()
        const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
            expand: ["latest_invoice"],
        })
        const item = current.items.data[0]
        if (!item) return NextResponse.json({ error: "Assinatura sem item." }, { status: 422 })

        // Guard boleto: com fatura em aberto (boleto de renovação aguardando
        // pagamento/vencido), trocar de plano empilharia mudança sobre cobrança
        // pendente. Regularizar primeiro. (Com cartão isso é raro — janela curta
        // entre finalização da fatura e a cobrança automática.)
        const latestInvoice = current.latest_invoice as Stripe.Invoice | null
        if (latestInvoice && latestInvoice.status === "open") {
            return NextResponse.json(
                {
                    error: "Há uma cobrança em aberto nesta assinatura. Pague a fatura pendente antes de trocar de plano.",
                    reason: "pending_payment",
                },
                { status: 409 }
            )
        }

        if (item.price.id === targetPrice) {
            return NextResponse.json({ error: "Você já está neste plano/ciclo.", reason: "same_plan" }, { status: 409 })
        }

        // Promotion code (opcional): resolver + validar ANTES da update.
        // Se o campo vier vazio/ausente, NÃO incluímos `discounts` na chamada —
        // preserva qualquer desconto ativo (regra do replace-by-set do Stripe).
        const promoRaw = body.promotion_code
        let discountsParam: Array<{ promotion_code: string }> | undefined
        if (promoRaw && promoRaw.trim().length > 0) {
            const result = await resolveAndValidatePromo(stripe, promoRaw, current)
            if ("reason" in result) {
                return NextResponse.json({ error: result.message, reason: result.reason }, { status: result.status })
            }
            discountsParam = [{ promotion_code: result.promoId }]
        }

        // Idempotency-key: protege double-submit dentro de uma janela curta (10s),
        // mas distingue operações LEGÍTIMAS subsequentes ao mesmo alvo (ex.: A→B→A→B
        // num único dia). Sem o bucket de tempo, a segunda viagem ao mesmo alvo é
        // deduplicada pelo Stripe — request 200 sem mutação real, webhook não dispara.
        const idempotencyKey =
            `chgplan:${sub.stripe_subscription_id}:${targetPrice}:${discountsParam ? discountsParam[0].promotion_code : "none"}:${Math.floor(Date.now() / 10000)}`

        // Troca via Stripe; proration do Stripe; webhook sincroniza o banco.
        try {
            await stripe.subscriptions.update(
                sub.stripe_subscription_id,
                {
                    items: [{ id: item.id, price: targetPrice }],
                    proration_behavior: "create_prorations",
                    metadata: { account_id: accountId, plan_code: planCode, cycle },
                    ...(discountsParam ? { discounts: discountsParam } : {}),
                },
                { idempotencyKey }
            )
        } catch (err) {
            // Mapeia erros conhecidos do Stripe para mensagens amigáveis (defesa em runtime).
            const msg = (err as Error).message ?? ""
            if (/minimum amount/i.test(msg)) {
                return NextResponse.json({ error: "Valor mínimo não atingido para este código.", reason: "minimum_amount" }, { status: 422 })
            }
            if (/first.time/i.test(msg) || /not.eligible/i.test(msg)) {
                return NextResponse.json({ error: "Código válido apenas para nova assinatura.", reason: "first_time_only" }, { status: 422 })
            }
            if (/expired|inactive|redemptions/i.test(msg)) {
                return NextResponse.json({ error: "Código não pôde ser aplicado. Tente novamente.", reason: "promo_error" }, { status: 422 })
            }
            if (/currency/i.test(msg)) {
                return NextResponse.json({ error: "Código não disponível em BRL.", reason: "currency_mismatch" }, { status: 422 })
            }
            stripeLog.error({
                op: "checkout",
                event: "change_plan_stripe_error",
                account_id: accountId,
                stripe_subscription_id: sub.stripe_subscription_id,
                msg,
            })
            throw err
        }

        stripeLog.info({
            op: "checkout",
            event: "plan_changed",
            account_id: accountId,
            stripe_subscription_id: sub.stripe_subscription_id,
            msg: `${planCode}/${cycle}`,
        })

        return NextResponse.json({ ok: true })
    } catch (error: unknown) {
        stripeLog.error({ op: "checkout", event: "change_plan_error", msg: (error as Error).message })
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
