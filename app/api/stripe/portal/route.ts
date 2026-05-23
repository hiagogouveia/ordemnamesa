import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { listUserAccountIds } from "@/lib/supabase/accounts"
import { getStripe } from "@/lib/stripe/server"
import { stripeLog } from "@/lib/stripe/log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * POST /api/stripe/portal
 *
 * Abre o Stripe Billing Portal para a account do usuário gerenciar
 * a assinatura (upgrade/downgrade/cancelar/cartão/invoices) — sem UI própria.
 *
 * Requisito: a account precisa ter um stripe_customer_id (cliente que já
 * passou pelo checkout). Sem customer → 409 (frontend cai para checkout).
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

        const body = (await request.json().catch(() => ({}))) as { account_id?: string }

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

        // Guard owner-only: apenas owner ativo da account pode abrir Billing Portal.
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

        // Customer 1:1 account: pega o customer da subscription mais recente da account.
        const { data: sub } = await admin
            .from("subscriptions")
            .select("stripe_customer_id, stripe_subscription_id, status")
            .eq("account_id", accountId)
            .not("stripe_customer_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ stripe_customer_id: string | null; stripe_subscription_id: string | null; status: string }>()

        if (!sub?.stripe_customer_id) {
            // Sem customer Stripe → nunca assinou: frontend deve usar checkout.
            return NextResponse.json(
                { error: "Sem assinatura no Stripe. Use o checkout.", reason: "no_customer" },
                { status: 409 }
            )
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
        const session = await getStripe().billingPortal.sessions.create({
            customer: sub.stripe_customer_id,
            return_url: `${siteUrl}/configuracoes`,
        })

        stripeLog.info({
            op: "portal",
            event: "session_created",
            account_id: accountId,
            stripe_customer_id: sub.stripe_customer_id,
            stripe_subscription_id: sub.stripe_subscription_id,
        })

        return NextResponse.json({ url: session.url })
    } catch (error: unknown) {
        stripeLog.error({ op: "portal", event: "error", msg: (error as Error).message })
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
