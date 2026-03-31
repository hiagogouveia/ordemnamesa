import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    return headers;
}

export interface UserAreaAssignment {
    id: string;
    user_id: string;
    area_id: string;
    created_at: string;
    area?: { id: string; name: string; color: string; priority_mode?: string } | null;
}

// Fetch all area assignments for a restaurant (for admin views)
export function useUserAreasByRestaurant(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["user-areas", restaurantId],
        queryFn: async (): Promise<UserAreaAssignment[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/user-areas?restaurant_id=${restaurantId}`,
                { headers }
            );
            if (!res.ok) return [];
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 60_000,
    });
}

// Fetch area assignments for a specific user (used by my-activities page)
export function useMyAreas(restaurantId: string | undefined, userId: string | undefined) {
    return useQuery({
        queryKey: ["my-areas", restaurantId, userId],
        queryFn: async (): Promise<UserAreaAssignment[]> => {
            if (!restaurantId || !userId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/user-areas?restaurant_id=${restaurantId}&user_id=${userId}`,
                { headers }
            );
            if (!res.ok) return [];
            return res.json();
        },
        enabled: !!restaurantId && !!userId,
        staleTime: 120_000,
    });
}

interface AssignUserAreaVariables {
    restaurant_id: string;
    user_id: string;
    area_id: string;
}

export function useAssignUserArea() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: AssignUserAreaVariables) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/user-areas", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao atribuir área.");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["user-areas", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-areas"] });
            queryClient.invalidateQueries({ queryKey: ["equipe", variables.restaurant_id] });
        },
    });
}

interface RemoveUserAreaVariables {
    id: string;
    restaurant_id: string;
}

export function useRemoveUserArea() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, restaurant_id }: RemoveUserAreaVariables) => {
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/user-areas/${id}?restaurant_id=${restaurant_id}`,
                { method: "DELETE", headers }
            );
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao remover da área.");
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["user-areas", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-areas"] });
            queryClient.invalidateQueries({ queryKey: ["equipe", variables.restaurant_id] });
        },
    });
}
