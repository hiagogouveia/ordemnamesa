import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

/**
 * Hook centralizado para obter o usuário autenticado atual.
 * Usa React Query como cache — a sessão só é buscada uma vez por montagem
 * e compartilhada entre todos os consumidores sem chamadas duplicadas.
 *
 * Fonte de verdade: Supabase Auth.
 * NÃO usar o restaurant-store para obter userId.
 */
export function useAuthUser() {
    return useQuery({
        queryKey: ["auth-user"],
        queryFn: async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            return user ?? null
        },
        staleTime: 5 * 60 * 1000,   // sessão não muda com frequência
        refetchOnWindowFocus: false,
    })
}
