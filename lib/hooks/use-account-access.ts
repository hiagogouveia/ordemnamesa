import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

export interface AccountUnitInfo {
    id: string
    name: string
}

export interface AccountAccess {
    units: AccountUnitInfo[]
    canUseGlobal: boolean
    role: 'owner' | 'manager' | null
}

async function getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`
    }
    return headers
}

export function useAccountAccess(accountId: string | null | undefined) {
    return useQuery<AccountAccess>({
        queryKey: ["account-access", accountId],
        queryFn: async () => {
            if (!accountId) {
                return { units: [], canUseGlobal: false, role: null }
            }
            const headers = await getAuthHeaders()
            const res = await fetch(`/api/accounts/${accountId}/access`, { headers })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error ?? "Erro ao carregar unidades.")
            }
            return (await res.json()) as AccountAccess
        },
        enabled: !!accountId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}
