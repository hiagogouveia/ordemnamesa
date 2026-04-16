import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

export interface Unit {
    id: string
    name: string
    slug: string
    cnpj: string | null
    is_primary: boolean
    active: boolean
    account_id: string
    created_at: string
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

async function parseError(res: Response, fallback: string): Promise<string> {
    try {
        const body = (await res.json()) as { error?: string }
        return body.error ?? fallback
    } catch {
        return fallback
    }
}

export function useUnits(accountId: string | null | undefined) {
    return useQuery({
        queryKey: ["units", accountId],
        queryFn: async (): Promise<Unit[]> => {
            if (!accountId) return []
            const headers = await getAuthHeaders()
            const res = await fetch(`/api/units?account_id=${accountId}`, { headers })
            if (!res.ok) throw new Error(await parseError(res, "Erro ao buscar unidades."))
            const data = (await res.json()) as { units: Unit[] }
            return data.units ?? []
        },
        enabled: !!accountId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}

interface CreateUnitInput {
    account_id: string
    name: string
    cnpj?: string | null
}

export function useCreateUnit() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateUnitInput): Promise<Unit> => {
            const headers = await getAuthHeaders()
            const res = await fetch("/api/units", {
                method: "POST",
                headers,
                body: JSON.stringify(input),
            })
            if (!res.ok) throw new Error(await parseError(res, "Erro ao criar unidade."))
            const data = (await res.json()) as { unit: Unit }
            return data.unit
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["units", variables.account_id] })
        },
    })
}

interface UpdateUnitInput {
    id: string
    account_id: string
    name?: string
}

export function useUpdateUnit() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: UpdateUnitInput): Promise<Unit> => {
            const headers = await getAuthHeaders()
            const res = await fetch(`/api/units/${input.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ account_id: input.account_id, name: input.name }),
            })
            if (!res.ok) throw new Error(await parseError(res, "Erro ao atualizar unidade."))
            const data = (await res.json()) as { unit: Unit }
            return data.unit
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["units", variables.account_id] })
        },
    })
}

interface SetPrimaryUnitInput {
    id: string
    account_id: string
}

export function useSetPrimaryUnit() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: SetPrimaryUnitInput): Promise<Unit> => {
            const headers = await getAuthHeaders()
            const res = await fetch(`/api/units/${input.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ account_id: input.account_id, set_primary: true }),
            })
            if (!res.ok) throw new Error(await parseError(res, "Erro ao definir unidade principal."))
            const data = (await res.json()) as { unit: Unit }
            return data.unit
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["units", variables.account_id] })
        },
    })
}

interface DeleteUnitInput {
    id: string
    account_id: string
}

export function useDeleteUnit() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: DeleteUnitInput): Promise<void> => {
            const headers = await getAuthHeaders()
            const res = await fetch(
                `/api/units/${input.id}?account_id=${input.account_id}`,
                { method: "DELETE", headers }
            )
            if (!res.ok) throw new Error(await parseError(res, "Erro ao excluir unidade."))
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["units", variables.account_id] })
        },
    })
}
