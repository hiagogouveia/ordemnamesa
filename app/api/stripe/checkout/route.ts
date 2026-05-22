import { NextResponse } from "next/server"
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

/**
 * POST /api/stripe/checkout
 *
 * Body: { plan_code: 'A'|'B'|'C'|'D', cycle: 'monthly'|'yearly', account_id? }
 *
 * Segurança:
 *  - account_id resolvido server-side (nunca confia no client).
 *  - price_id resolvido server-side a partir de plan_code+cycle (client NÃO envia price).
 *  - customer Stripe é 1:1 com a account (criado/reusado).
 *  - cupom: allow_promotion_codes deixa o cliente aplicar cupom na tela do Stripe.
 *
 * Retorna { url } da Checkout Session hospedada.
 */
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization")
        if (!authHeader) {
            return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
        }
        const token = authHeader.replace("Bearer ", "")
        const admin = getAdminSupabase()

        const {
            data: { user },
            error: userError,
        } = await admin.auth.getUser(token)
        if (userError || !user) {
            return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
        }

        const body = (await request.json().catch(() => ({}))) as {
            plan_code?: string
            cycle?: string
            account_id?: string
        }

        const planCode = body.plan_code as PlanCode
        const cycle = body.cycle as BillingCycle
        if (!VALID_CODES.includes(planCode) || !VALID_CYCLES.includes(cycle)) {
            return NextResponse.json(
                { error: "plan_code (A-D) e cycle (monthly|yearly) são obrigatórios." },
                { status: 400 }
            )
        }

        // Resolve account do user — valida posse.
        const accountIds = await listUserAccountIds(admin, user.id)
        if (accountIds.length === 0) {
            return NextResponse.json(
                { error: "Usuário não pertence a nenhuma account." },
                { status: 404 }
            )
        }
        let accountId: string
        if (accountIds.length === 1) {
            accountId = accountIds[0]
        } else {
            const requested = body.account_id ?? request.headers.get("x-account-id") ?? null
            if (!requested) {
                return NextResponse.json(
                    { error: "Múltiplas accounts. Informe account_id." },
                    { status: 400 }
                )
            }
            if (!accountIds.includes(requested)) {
                return NextResponse.json({ error: "Account não pertence ao usuário." }, { status: 403 })
            }
            accountId = requested
        }

        // Resolve price_id server-side (fonte de verdade: tabela plans).
        const { data: plan } = await admin
            .from("plans")
            .select("id, stripe_price_id_monthly, stripe_price_id_yearly")
            .eq("code", planCode)
            .eq("active", true)
            .maybeSingle<{
                id: string
                stripe_price_id_monthly: string | null
                stripe_price_id_yearly: string | null
            }>()

        const priceId = cycle === "yearly" ? plan?.stripe_price_id_yearly : plan?.stripe_price_id_monthly
        if (!plan || !priceId) {
            return NextResponse.json(
                { error: "Plano sem price configurado no Stripe. Contate o suporte." },
                { status: 422 }
            )
        }

        const stripe = getStripe()

        // Customer 1:1 com a account: reusa se já existe na subscription viva.
        const { data: liveSub } = await admin
            .from("subscriptions")
            .select("id, stripe_customer_id, stripe_subscription_id, status")
            .eq("account_id", accountId)
            .in("status", ["trial", "active", "past_due"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{
                id: string
                stripe_customer_id: string | null
                stripe_subscription_id: string | null
                status: string
            }>()

        // Edge case: já existe assinatura ATIVA no Stripe → não criar outra.
        // Mudança de plano/cancelamento é feita no Customer Portal.
        if (liveSub?.status === "active" && liveSub.stripe_subscription_id) {
            return NextResponse.json(
                { error: "Você já tem uma assinatura ativa. Gerencie pelo portal.", reason: "already_active" },
                { status: 409 }
            )
        }

        let customerId = liveSub?.stripe_customer_id ?? null
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email ?? undefined,
                metadata: { account_id: accountId },
            })
            customerId = customer.id
            // Persiste o vínculo já (idempotência do customer por account).
            if (liveSub?.id) {
                await admin
                    .from("subscriptions")
                    .update({ stripe_customer_id: customerId })
                    .eq("id", liveSub.id)
            }
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            allow_promotion_codes: true,
            client_reference_id: accountId,
            metadata: { account_id: accountId, plan_code: planCode, cycle },
            subscription_data: {
                metadata: { account_id: accountId, plan_code: planCode, cycle },
            },
            success_url: `${siteUrl}/configuracoes?checkout=success`,
            cancel_url: `${siteUrl}/configuracoes?checkout=cancel`,
        })

        stripeLog.info({
            op: "checkout",
            event: "session_created",
            account_id: accountId,
            stripe_customer_id: customerId,
            msg: `${planCode}/${cycle}`,
        })

        return NextResponse.json({ url: session.url })
    } catch (error: unknown) {
        stripeLog.error({ op: "checkout", event: "error", msg: (error as Error).message })
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
