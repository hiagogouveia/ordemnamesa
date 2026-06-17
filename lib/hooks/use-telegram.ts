import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

const getAuthToken = async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ""
}

export interface TelegramStatus {
    connected: boolean
    external_id_masked?: string
    connected_at?: string
}

export interface TelegramConnectResult {
    token: string
    deep_link: string
    bot_username: string
    expires_at: string
}

const STATUS_KEY = (restaurantId: string | null) => ["telegram-status", restaurantId]

/**
 * Status do canal Telegram do usuário. `poll` ativa refetch periódico
 * (usado enquanto o modal de conexão está aberto, p/ detectar o vínculo).
 */
export const useTelegramStatus = (restaurantId: string | null, poll = false) => {
    return useQuery<TelegramStatus>({
        queryKey: STATUS_KEY(restaurantId),
        queryFn: async () => {
            const token = await getAuthToken()
            const res = await fetch(`/api/telegram/status?restaurant_id=${restaurantId}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error || "Falha ao buscar status do Telegram")
            }
            return res.json()
        },
        enabled: !!restaurantId,
        staleTime: 60 * 1000,
        refetchInterval: poll ? 3000 : false,
    })
}

export const useConnectTelegram = (restaurantId: string | null) => {
    return useMutation<TelegramConnectResult>({
        mutationFn: async () => {
            const token = await getAuthToken()
            const res = await fetch("/api/telegram/connect", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ restaurant_id: restaurantId }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error || "Falha ao gerar código de vínculo")
            }
            return res.json()
        },
    })
}

export const useDisconnectTelegram = (restaurantId: string | null) => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => {
            const token = await getAuthToken()
            const res = await fetch("/api/telegram/disconnect", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ restaurant_id: restaurantId }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error || "Falha ao desconectar")
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: STATUS_KEY(restaurantId) })
        },
    })
}

export const useTestTelegram = (restaurantId: string | null) => {
    return useMutation({
        mutationFn: async () => {
            const token = await getAuthToken()
            const res = await fetch("/api/telegram/test", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ restaurant_id: restaurantId }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error || "Falha ao enviar mensagem de teste")
            }
            return res.json()
        },
    })
}
