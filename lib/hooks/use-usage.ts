"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAccountSessionStore } from "@/lib/store/account-session-store"

export interface AccountUsage {
    units: number
    managers: number
    max_staff_per_unit: number
}

/**
 * Uso atual da account (unidades, managers, maior staff por unidade).
 * Usado para pré-validar downgrade contra os limites do plano alvo.
 */
export function useUsage() {
    const accountId = useAccountSessionStore((s) => s.accountId)

    return useQuery<AccountUsage>({
        queryKey: ["billing-usage", accountId],
        queryFn: async () => {
            const supabase = createClient()
            const {
                data: { session },
            } = await supabase.auth.getSession()
            const headers: Record<string, string> = { "Content-Type": "application/json" }
            if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`

            const url = accountId ? `/api/billing/usage?account_id=${accountId}` : "/api/billing/usage"
            const res = await fetch(url, { headers })
            if (!res.ok) throw new Error("Erro ao carregar uso da conta")
            return res.json() as Promise<AccountUsage>
        },
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}
