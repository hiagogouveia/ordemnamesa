import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserRoleAssignment, UserShiftAssignment } from "../types";
import { createClient } from "@/lib/supabase/client";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

export function useUserRoles(restaurantId: string | undefined, userId?: string) {
    return useQuery({
        queryKey: ["user-roles", restaurantId, userId],
        queryFn: async (): Promise<UserRoleAssignment[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            let url = `/api/user-roles?restaurant_id=${restaurantId}`;
            if (userId) url += `&user_id=${userId}`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error("Erro ao buscar funções do usuário");
            return res.json();
        },
        enabled: !!restaurantId,
    });
}

export function useCreateUserRole() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { restaurant_id: string, user_id: string, role_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/user-roles", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao atribuir função");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["user-roles", variables.restaurant_id, variables.user_id] });
            queryClient.invalidateQueries({ queryKey: ["user-roles", variables.restaurant_id] });
        },
    });
}

export function useDeleteUserRole() {
    const queryClient = useQueryClient();
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        mutationFn: async ({ id, restaurant_id: _r1, user_id: _u1 }: { id: string, restaurant_id: string, user_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/user-roles/${id}`, {
                method: "DELETE",
                headers,
            });
            if (!res.ok) throw new Error("Erro ao remover função");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["user-roles", variables.restaurant_id, variables.user_id] });
            queryClient.invalidateQueries({ queryKey: ["user-roles", variables.restaurant_id] });
        },
    });
}

export function useUserShifts(restaurantId: string | undefined, userId?: string) {
    return useQuery({
        queryKey: ["user-shifts", restaurantId, userId],
        queryFn: async (): Promise<UserShiftAssignment[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            let url = `/api/user-shifts?restaurant_id=${restaurantId}`;
            if (userId) url += `&user_id=${userId}`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error("Erro ao buscar turnos do usuário");
            return res.json();
        },
        enabled: !!restaurantId,
    });
}

export function useCreateUserShift() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { restaurant_id: string, user_id: string, shift_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/user-shifts", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao atribuir turno");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["user-shifts", variables.restaurant_id, variables.user_id] });
            queryClient.invalidateQueries({ queryKey: ["user-shifts", variables.restaurant_id] });
        },
    });
}

export function useDeleteUserShift() {
    const queryClient = useQueryClient();
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        mutationFn: async ({ id, restaurant_id: _r2, user_id: _u2 }: { id: string, restaurant_id: string, user_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/user-shifts/${id}`, {
                method: "DELETE",
                headers,
            });
            if (!res.ok) throw new Error("Erro ao remover turno");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["user-shifts", variables.restaurant_id, variables.user_id] });
            queryClient.invalidateQueries({ queryKey: ["user-shifts", variables.restaurant_id] });
        },
    });
}
