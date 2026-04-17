import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

export interface ManagerPermission {
    id: string
    user_id: string
    name: string
    email: string
    can_view_global: boolean
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

export function useGlobalPermissions(accountId: string | null | undefined) {
    return useQuery<{ managers: ManagerPermission[] }>({
        queryKey: ["global-permissions", accountId],
        queryFn: async () => {
            if (!accountId) return { managers: [] }
            const headers = await getAuthHeaders()
            const res = await fetch(`/api/accounts/${accountId}/global-permissions`, { headers })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error ?? "Erro ao carregar permissões.")
            }
            return (await res.json()) as { managers: ManagerPermission[] }
        },
        enabled: !!accountId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}

export function useToggleGlobalPermission(accountId: string | null | undefined) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ accountUserId, canViewGlobal }: { accountUserId: string; canViewGlobal: boolean }) => {
            if (!accountId) throw new Error("Account não selecionada.")
            const headers = await getAuthHeaders()
            const res = await fetch(`/api/accounts/${accountId}/global-permissions`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ account_user_id: accountUserId, can_view_global: canViewGlobal }),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error ?? "Erro ao atualizar permissão.")
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["global-permissions", accountId] })
            queryClient.invalidateQueries({ queryKey: ["account-access", accountId] })
        },
    })
}
