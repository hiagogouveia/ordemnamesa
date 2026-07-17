"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAccountSessionStore } from "@/lib/store/account-session-store"
import { useBilling } from "@/lib/hooks/use-billing"

/**
 * Estado de pagamento pendente (boleto) derivado on-demand do Stripe.
 * Espelha o contrato de GET /api/billing/pending-payment.
 */
export type PendingPayment =
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

async function getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient()
    const {
        data: { session },
    } = await supabase.auth.getSession()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`
    }
    return headers
}

/**
 * Consulta o boleto pendente da account — SÓ quando o espelho indica pendência
 * possível (status trial/incomplete/past_due COM sub Stripe vinculada). Trial
 * puro de signup (sem sub) e contas active nunca disparam chamada ao Stripe.
 *
 * Fail-soft: erro na API resolve para { state: 'none' } — este hook alimenta
 * apenas card/banner informativos, nunca gating de acesso.
 */
export function usePendingPayment() {
    const accountId = useAccountSessionStore((s) => s.accountId)
    const billing = useBilling()

    const sub = billing.data?.subscription
    const mayHavePending =
        !!sub?.stripe_subscription_id &&
        ["trial", "incomplete", "past_due"].includes(sub.status)

    return useQuery<PendingPayment>({
        queryKey: ["pending-payment", accountId, sub?.stripe_subscription_id],
        queryFn: async () => {
            const headers = await getAuthHeaders()
            const url = accountId
                ? `/api/billing/pending-payment?account_id=${accountId}`
                : "/api/billing/pending-payment"
            const res = await fetch(url, { headers })
            if (!res.ok) return { state: "none" }
            return (await res.json()) as PendingPayment
        },
        enabled: mayHavePending,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        retry: false,
    })
}
