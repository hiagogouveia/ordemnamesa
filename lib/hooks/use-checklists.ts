import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checklist } from "../types";

// Buscar Checklists
export function useChecklists(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["checklists", restaurantId],
        queryFn: async (): Promise<Checklist[]> => {
            if (!restaurantId) return [];
            const res = await fetch(`/api/checklists?restaurant_id=${restaurantId}`);
            if (!res.ok) throw new Error("Erro ao buscar checklists");
            return res.json();
        },
        enabled: !!restaurantId,
    });
}

// Criar Checklist
export function useCreateChecklist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: Partial<Checklist>) => {
            const res = await fetch("/api/checklists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao criar checklist");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", variables.restaurant_id] });
        },
    });
}

// Atualizar Checklist
export function useUpdateChecklist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: Partial<Checklist> & { id: string }) => {
            const res = await fetch(`/api/checklists/${data.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao atualizar checklist");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", variables.restaurant_id] });
        },
    });
}

// Deletar Checklist (Soft Delete)
export function useDeleteChecklist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, restaurantId }: { id: string; restaurantId: string }) => {
            const res = await fetch(`/api/checklists/${id}?restaurant_id=${restaurantId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Erro ao deletar checklist");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", variables.restaurantId] });
        },
    });
}
