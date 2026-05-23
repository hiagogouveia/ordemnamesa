import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { listUserAccountIds } from "@/lib/supabase/accounts"
import { getStripe } from "@/lib/stripe/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * GET /api/billing/discount
 *
 * Lê o desconto ativo direto do Stripe (subscription.discounts) — sem persistir,
 * sem cache local, sem cálculo proprietário. Stripe segue sendo source of truth.
 *
 * Retorna { discount: null } quando:
 *  - account sem subscription Stripe
 *  - subscription sem discounts
 *  - falha temporária ao consultar Stripe (fail-soft: não derruba a aba Plano)
 */
export async function GET(request: Request) {
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

        const accountIds = await listUserAccountIds(admin, user.id)
        if (accountIds.length === 0) {
            return NextResponse.json({ error: "Usuário não pertence a nenhuma account." }, { status: 404 })
        }
        let accountId: string
        if (accountIds.length === 1) {
            accountId = accountIds[0]
        } else {
            const { searchParams } = new URL(request.url)
            const requested = searchParams.get("account_id") ?? request.headers.get("x-account-id") ?? null
            if (!requested) return NextResponse.json({ error: "Múltiplas accounts. Informe account_id." }, { status: 400 })
            if (!accountIds.includes(requested)) {
                return NextResponse.json({ error: "Account não pertence ao usuário." }, { status: 403 })
            }
            accountId = requested
        }

        const { data: sub } = await admin
            .from("subscriptions")
            .select("stripe_subscription_id")
            .eq("account_id", accountId)
            .not("stripe_subscription_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ stripe_subscription_id: string | null }>()

        if (!sub?.stripe_subscription_id) return NextResponse.json({ discount: null })

        // Fail-soft: erro do Stripe não derruba a aba (UI exibe sem o card de desconto).
        let stripeSub: Stripe.Subscription
        try {
            stripeSub = await getStripe().subscriptions.retrieve(sub.stripe_subscription_id, {
                expand: ["discounts.source.coupon", "discounts.promotion_code"],
            })
        } catch {
            return NextResponse.json({ discount: null })
        }

        // sub.discounts é array no API atual; pegamos o primeiro (não suportamos stacking).
        const discounts = (stripeSub.discounts ?? []) as Array<string | Stripe.Discount>
        const first = discounts.find((d) => typeof d !== "string") as Stripe.Discount | undefined
        if (!first) return NextResponse.json({ discount: null })

        // Em dahlia, coupon mora em discount.source.coupon (expandido acima).
        const coupon = typeof first.source?.coupon === "object" && first.source.coupon !== null ? first.source.coupon : null
        if (!coupon) return NextResponse.json({ discount: null })

        const promo =
            typeof first.promotion_code === "object" && first.promotion_code !== null
                ? first.promotion_code
                : null
        // Label: prefere o código digitável; fallback para nome/ID do coupon.
        const label = promo?.code ?? coupon.name ?? coupon.id

        return NextResponse.json({
            discount: {
                label,
                percent_off: coupon.percent_off,
                amount_off: coupon.amount_off,
                currency: coupon.currency,
                duration: coupon.duration as "once" | "repeating" | "forever",
                duration_in_months: coupon.duration_in_months,
                ends_at: first.end ?? null,
            },
        })
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
