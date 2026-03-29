import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistOrder } from "@/lib/types";

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

export function useChecklistOrders(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["checklist-orders", restaurantId],
        queryFn: async (): Promise<ChecklistOrder[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/checklists/orders?restaurant_id=${restaurantId}`,
                { headers }
            );
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao buscar ordens de checklists.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

export function useUpdateChecklistOrders() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            restaurantId,
            orders,
        }: {
            restaurantId: string;
            orders: Array<{ checklist_id: string; shift: string; position: number }>;
        }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklists/orders", {
                method: "PATCH",
                headers,
                body: JSON.stringify({ restaurant_id: restaurantId, orders }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao salvar ordens.");
            }
        },
        onSuccess: (_, { restaurantId }) => {
            queryClient.invalidateQueries({ queryKey: ["checklist-orders", restaurantId] });
        },
    });
}
