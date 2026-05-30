import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

export interface UserProfile {
    id: string
    name: string | null
}

/**
 * Busca o perfil oficial do usuário em `public.users` — fonte de verdade do
 * nome cadastrado no sistema (o `user_metadata` do Auth pode estar vazio para
 * contas antigas, então não é confiável para exibição).
 *
 * Cacheado por React Query: uma única chamada por usuário, compartilhada entre
 * todos os consumidores sem queries duplicadas. RLS garante que cada usuário só
 * enxerga o próprio perfil (`auth.uid() = id`).
 */
export function useUserProfile(userId: string | null | undefined) {
    return useQuery({
        queryKey: ["user-profile", userId],
        queryFn: async (): Promise<UserProfile | null> => {
            if (!userId) return null
            const supabase = createClient()
            const { data } = await supabase
                .from("users")
                .select("id, name")
                .eq("id", userId)
                .maybeSingle<UserProfile>()
            return data ?? null
        },
        enabled: !!userId,
        staleTime: 5 * 60 * 1000,   // nome não muda com frequência
        refetchOnWindowFocus: false,
    })
}
