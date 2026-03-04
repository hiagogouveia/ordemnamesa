import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checklist } from "../types";
import { createClient } from "@/lib/supabase/client";

// Função helper para obter o token de Auth e adicionar aos headers
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

// Buscar Checklists
export function useChecklists(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["checklists", restaurantId],
        queryFn: async (): Promise<Checklist[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/checklists?restaurant_id=${restaurantId}`, {
                headers,
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao buscar checklists");
            }
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
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklists", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao criar checklist");
            }
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
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/checklists/${data.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao atualizar checklist");
            }
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
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/checklists/${id}?restaurant_id=${restaurantId}`, {
                method: "DELETE",
                headers,
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao deletar checklist");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", variables.restaurantId] });
        },
    });
}
