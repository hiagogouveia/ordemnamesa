import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { MyActivity } from "@/lib/types";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    return headers;
}

export function useMyActivities(restaurantId: string | undefined, userId?: string) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["my-activities", restaurantId, userId],
        queryFn: async (): Promise<MyActivity[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/my-activities?restaurant_id=${restaurantId}`,
                { headers }
            );
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao buscar atividades.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: true,
    });

    // Realtime: escutar mudanças em checklist_assumptions para atualizar imediatamente
    useEffect(() => {
        if (!restaurantId) return;

        const supabase = createClient();
        const channel = supabase
            .channel(`my-activities-rt-${restaurantId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'checklist_assumptions',
                    filter: `restaurant_id=eq.${restaurantId}`,
                },
                () => {
                    // Invalidar para refetch com dados atualizados
                    queryClient.invalidateQueries({ queryKey: ["my-activities", restaurantId] });
                    queryClient.invalidateQueries({ queryKey: ["my-activities-badge", restaurantId] });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'task_executions',
                    filter: `restaurant_id=eq.${restaurantId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["my-activities", restaurantId] });
                    queryClient.invalidateQueries({ queryKey: ["my-activities-badge", restaurantId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [restaurantId, queryClient]);

    return query;
}

export function useMyActivitiesBadge(restaurantId: string | undefined, userId?: string) {
    return useQuery({
        queryKey: ["my-activities-badge", restaurantId, userId],
        queryFn: async (): Promise<{ pending: number }> => {
            if (!restaurantId) return { pending: 0 };
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/my-activities/badge?restaurant_id=${restaurantId}`,
                { headers }
            );
            if (!res.ok) return { pending: 0 };
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: true,
    });
}

// Helper to invalidate activity data after an execution completes
export function useInvalidateMyActivities() {
    const queryClient = useQueryClient();
    return (restaurantId: string) => {
        queryClient.invalidateQueries({ queryKey: ["my-activities", restaurantId] });
        queryClient.invalidateQueries({ queryKey: ["my-activities-badge", restaurantId] });
    };
}
