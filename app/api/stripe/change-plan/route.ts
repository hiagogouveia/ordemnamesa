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
        const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
        const item = current.items.data[0]
        if (!item) return NextResponse.json({ error: "Assinatura sem item." }, { status: 422 })

        if (item.price.id === targetPrice) {
            return NextResponse.json({ error: "Você já está neste plano/ciclo.", reason: "same_plan" }, { status: 409 })
        }

        // Troca via Stripe; proration do Stripe; webhook sincroniza o banco.
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
            items: [{ id: item.id, price: targetPrice }],
            proration_behavior: "create_prorations",
            metadata: { account_id: accountId, plan_code: planCode, cycle },
        })

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
