import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Role } from "../types";
import { createClient } from "@/lib/supabase/client";

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

export function useRoles(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["roles", restaurantId],
        queryFn: async (): Promise<Role[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/roles?restaurant_id=${restaurantId}`, { headers });
            if (!res.ok) throw new Error("Erro ao buscar funções");
            return res.json();
        },
        enabled: !!restaurantId,
    });
}

export function useCreateRole() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<Role> & { restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/roles", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao criar função");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["roles", variables.restaurant_id] });
        },
    });
}

export function useUpdateRole() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<Role> & { id: string, restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/roles/${data.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao atualizar função");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["roles", variables.restaurant_id] });
        },
    });
}
