"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAccountSessionStore } from "@/lib/store/account-session-store"

export interface ActiveDiscount {
    /** O que o cliente vê: prefere o code do promotion_code; fallback nome/ID do coupon. */
    label: string
    percent_off: number | null
    amount_off: number | null
    currency: string | null
    duration: "once" | "repeating" | "forever"
    duration_in_months: number | null
    /** Epoch (segundos) do fim do desconto. null em `forever`. */
    ends_at: number | null
}

/**
 * Desconto ativo da subscription, lido direto do Stripe (sem persistência local).
 * Retorna null quando não há desconto ou ao falhar (fail-soft no backend).
 */
export function useSubscriptionDiscount() {
    const accountId = useAccountSessionStore((s) => s.accountId)

    return useQuery<ActiveDiscount | null>({
        queryKey: ["subscription-discount", accountId],
        queryFn: async () => {
            const supabase = createClient()
            const {
                data: { session },
            } = await supabase.auth.getSession()
            const headers: Record<string, string> = { "Content-Type": "application/json" }
            if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`

            const url = accountId ? `/api/billing/discount?account_id=${accountId}` : "/api/billing/discount"
            const res = await fetch(url, { headers })
            if (!res.ok) return null
            const data = (await res.json()) as { discount: ActiveDiscount | null }
            return data.discount
        },
        staleTime: 60 * 1000, // 1min — desconto muda raramente; webhook invalida quando preciso
        refetchOnWindowFocus: false,
        retry: false,
    })
}
