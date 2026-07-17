import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { listUserAccountIds } from "@/lib/supabase/accounts"
import { getAccountBilling } from "@/lib/billing/subscription-access"
import { getStripe } from "@/lib/stripe/server"
import { stripeLog } from "@/lib/stripe/log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Estados derivados ON-DEMAND do Stripe (nada é persistido — o voucher muda a
 * cada invoice e tem TTL; o espelho local continua mínimo):
 *
 * - boleto_pending: voucher ativo aguardando pagamento (1ª compra ou renovação).
 * - invoice_open:   renovação com voucher VENCIDO — o link pagável é a hosted
 *                   invoice page (gera novo boleto), não o voucher morto.
 * - boleto_expired: 1ª compra cujo voucher venceu (sub incomplete_expired) —
 *                   o caminho é um novo checkout.
 * - none:           nada pendente (ou falha na consulta — fail-soft: o gating
 *                   NUNCA depende deste endpoint, só o card/banner informativo).
 */
export type PendingPaymentState =
    | { state: "none" }
    | { state: "boleto_expired" }
    | {
          state: "boleto_pending"
          hosted_voucher_url: string
          expires_at: string | null
          amount_cents: number
          context: "first_payment" | "renewal"
      }
    | {
          state: "invoice_open"
          hosted_invoice_url: string
          amount_cents: number
          context: "renewal"
      }

/**
 * Resolve o PaymentIntent da invoice cobrindo as duas gerações de payload:
 * `invoice.payment_intent` (legado) e a lista `invoice.payments` (apiVersions
 * pós-Basil, incluindo a dahlia fixada em lib/stripe/server.ts).
 */
async function resolveInvoicePaymentIntent(
    stripe: Stripe,
    invoice: Stripe.Invoice
): Promise<Stripe.PaymentIntent | null> {
    const legacy = (invoice as unknown as { payment_intent?: string | Stripe.PaymentIntent })
        .payment_intent
    if (legacy) {
        return typeof legacy === "string" ? stripe.paymentIntents.retrieve(legacy) : legacy
    }

    const { data: payments } = await stripe.invoicePayments.list({
        invoice: invoice.id,
        limit: 1,
    })
    const piRef = payments[0]?.payment?.payment_intent
    if (!piRef) return null
    return typeof piRef === "string" ? stripe.paymentIntents.retrieve(piRef) : piRef
}

/**
 * GET /api/billing/pending-payment
 *
 * Mesmo contrato de auth/resolução de account do /api/billing/status:
 * Bearer token + owner-only + account_id validado contra a lista do user.
 */
export async function GET(request: Request) {
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

        const accountIds = await listUserAccountIds(admin, user.id)
        if (accountIds.length === 0) {
            return NextResponse.json(
                { error: "Usuário não pertence a nenhuma account.", code: "not_account_member" },
                { status: 404 }
            )
        }

        let targetAccountId: string
        if (accountIds.length === 1) {
            targetAccountId = accountIds[0]
        } else {
            const { searchParams } = new URL(request.url)
            const requested =
                searchParams.get("account_id") ?? request.headers.get("x-account-id") ?? null
            if (!requested) {
                return NextResponse.json(
                    { error: "Múltiplas accounts. Informe account_id." },
                    { status: 400 }
                )
            }
            if (!accountIds.includes(requested)) {
                return NextResponse.json(
                    { error: "Account não pertence ao usuário.", code: "not_account_member" },
                    { status: 403 }
                )
            }
            targetAccountId = requested
        }

        // Guard owner-only: billing é assunto do proprietário.
        const { data: ownerCheck } = await admin
            .from("account_users")
            .select("role, active")
            .eq("account_id", targetAccountId)
            .eq("user_id", user.id)
            .maybeSingle<{ role: string; active: boolean }>()
        if (!ownerCheck || !ownerCheck.active || ownerCheck.role !== "owner") {
            return NextResponse.json(
                { error: "Apenas o proprietário da conta pode gerenciar billing.", code: "forbidden_billing" },
                { status: 403 }
            )
        }

        const billing = await getAccountBilling(admin, targetAccountId)
        const subId = billing?.subscription.stripe_subscription_id
        // Só há pendência possível quando o espelho aponta uma sub Stripe e o
        // status admite pagamento em aberto — evita chamada Stripe para trial
        // puro de signup (sem sub) e para contas active saudáveis.
        const status = billing?.subscription.status
        if (!subId || !status || !["trial", "incomplete", "past_due"].includes(status)) {
            return NextResponse.json({ state: "none" } satisfies PendingPaymentState)
        }

        const stripe = getStripe()
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ["latest_invoice"] })

        if (sub.status === "incomplete_expired") {
            return NextResponse.json({ state: "boleto_expired" } satisfies PendingPaymentState)
        }

        const invoice = (sub.latest_invoice as Stripe.Invoice | null) ?? null
        if (!invoice || invoice.status !== "open") {
            return NextResponse.json({ state: "none" } satisfies PendingPaymentState)
        }

        const context: "first_payment" | "renewal" =
            invoice.billing_reason === "subscription_create" ? "first_payment" : "renewal"

        const pi = await resolveInvoicePaymentIntent(stripe, invoice)
        const boleto = pi?.next_action?.boleto_display_details

        if (pi?.status === "requires_action" && boleto?.hosted_voucher_url) {
            return NextResponse.json({
                state: "boleto_pending",
                hosted_voucher_url: boleto.hosted_voucher_url,
                expires_at: boleto.expires_at
                    ? new Date(boleto.expires_at * 1000).toISOString()
                    : null,
                amount_cents: pi.amount,
                context,
            } satisfies PendingPaymentState)
        }

        // Invoice aberta sem voucher pagável (vencido/cancelado): na renovação a
        // hosted invoice page é o caminho de regularização (gera novo boleto).
        if (context === "renewal" && invoice.hosted_invoice_url) {
            return NextResponse.json({
                state: "invoice_open",
                hosted_invoice_url: invoice.hosted_invoice_url,
                amount_cents: invoice.amount_due,
                context,
            } satisfies PendingPaymentState)
        }

        return NextResponse.json({ state: "none" } satisfies PendingPaymentState)
    } catch (error: unknown) {
        // Fail-soft: a UI degrada só o card informativo; gating não passa por aqui.
        stripeLog.warn({
            op: "billing",
            event: "pending_payment_error",
            msg: (error as Error).message,
        })
        return NextResponse.json({ state: "none" } satisfies PendingPaymentState)
    }
}
