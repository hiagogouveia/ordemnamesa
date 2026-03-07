import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shift } from "../types";
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

export function useShifts(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["shifts", restaurantId],
        queryFn: async (): Promise<Shift[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/shifts?restaurant_id=${restaurantId}`, { headers });
            if (!res.ok) throw new Error("Erro ao buscar turnos");
            return res.json();
        },
        enabled: !!restaurantId,
    });
}

export function useCreateShift() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<Shift> & { restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/shifts", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao criar turno");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["shifts", variables.restaurant_id] });
        },
    });
}

export function useUpdateShift() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<Shift> & { id: string, restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/shifts/${data.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao atualizar turno");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["shifts", variables.restaurant_id] });
        },
    });
}

export function useDeleteShift() {
    const queryClient = useQueryClient();
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        mutationFn: async ({ id, restaurant_id: _r }: { id: string; restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/shifts/${id}`, {
                method: "DELETE",
                headers,
            });
            if (!res.ok) throw new Error("Erro ao deletar turno");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["shifts", variables.restaurant_id] });
        },
    });
}
