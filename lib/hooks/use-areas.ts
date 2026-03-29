import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Area } from "@/lib/types";

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

// Returns only the user's own areas (for filter bars and activity visibility)
export function useAreas(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["areas", restaurantId],
        queryFn: async (): Promise<Area[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/areas?restaurant_id=${restaurantId}`, { headers, cache: "no-store" });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao buscar áreas.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 300_000,
    });
}

// Returns ALL areas in the restaurant (for admin management — owner/manager only)
export function useAllAreas(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["areas-all", restaurantId],
        queryFn: async (): Promise<Area[]> => {
            if (!restaurantId) return [];
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                console.warn("[useAllAreas] sem access_token — sessão expirada?");
                return [];
            }
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
            };
            const res = await fetch(
                `/api/areas?restaurant_id=${restaurantId}&scope=all`,
                { headers, cache: "no-store" }
            );
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error(`[useAllAreas] HTTP ${res.status}:`, text);
                return [];
            }
            const data: Area[] = await res.json();
            console.log("[useAllAreas]", { restaurantId, count: data.length, data });
            return data;
        },
        enabled: !!restaurantId,
        staleTime: 0,
    });
}

interface CreateAreaVariables {
    restaurant_id: string;
    name: string;
    description?: string;
    color?: string;
}

export function useCreateArea() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateAreaVariables): Promise<Area> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/areas", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao criar área.");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["areas", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["areas-all", variables.restaurant_id] });
        },
    });
}

interface UpdateAreaVariables {
    id: string;
    restaurant_id: string;
    name?: string;
    description?: string;
    color?: string;
}

export function useUpdateArea() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: UpdateAreaVariables): Promise<Area> => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/areas/${id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao atualizar área.");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["areas", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["areas-all", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", variables.restaurant_id] });
        },
    });
}

interface DeleteAreaVariables {
    id: string;
    restaurant_id: string;
}

export function useDeleteArea() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, restaurant_id }: DeleteAreaVariables): Promise<void> => {
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/areas/${id}?restaurant_id=${restaurant_id}`,
                { method: "DELETE", headers }
            );
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao excluir área.");
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["areas", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["areas-all", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", variables.restaurant_id] });
        },
    });
}
