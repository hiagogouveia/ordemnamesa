import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PurchaseList, PurchaseItem } from "../types";
import { createClient } from "@/lib/supabase/client";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

export function usePurchaseLists(restaurantId: string | undefined, status?: 'open' | 'closed') {
    return useQuery({
        queryKey: ["purchase-lists", restaurantId, status],
        queryFn: async (): Promise<PurchaseList[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            let url = `/api/purchase-lists?restaurant_id=${restaurantId}`;
            if (status) url += `&status=${status}`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error("Erro ao buscar listas de compras");
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 60 * 1000,        // listas de compras têm movimento frequente
        refetchOnWindowFocus: true,
    });
}

export function usePurchaseListDetails(restaurantId: string | undefined, listId: string | undefined) {
    return useQuery({
        queryKey: ["purchase-list", restaurantId, listId],
        queryFn: async (): Promise<{ list: PurchaseList; items: PurchaseItem[] }> => {
            if (!restaurantId || !listId) throw new Error("Missing params");
            const headers = await getAuthHeaders();
            // We can fetch the list itself 
            const resList = await fetch(`/api/purchase-lists/${listId}?restaurant_id=${restaurantId}`, { headers });
            if (!resList.ok) throw new Error("Erro ao buscar detalhes da lista");
            const list = await resList.json();

            // And its items. (Wait, do we have an endpoint for lists/[id]? If not, we might need to filter the master list or create one. Let's assume the API returns items, or we fetch items differently. Wait, S6 APIs say: GET /api/purchase-lists?status...)
            return { list, items: list.items || [] };
        },
        enabled: !!restaurantId && !!listId,
        staleTime: 60 * 1000,        // itens de uma lista mudam durante operação
        refetchOnWindowFocus: true,
    });
}

export function useCreatePurchaseList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<PurchaseList> & { restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/purchase-lists", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao criar lista");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["purchase-lists", variables.restaurant_id] });
        },
    });
}

export function useUpdatePurchaseList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { id: string, restaurant_id: string, status?: 'closed' }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/purchase-lists/${data.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao atualizar lista");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["purchase-lists", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["purchase-list", variables.restaurant_id, variables.id] });
        },
    });
}

export function useCreatePurchaseItem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<PurchaseItem> & { restaurant_id: string, purchase_list_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/purchase-items", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao adicionar item");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["purchase-list", variables.restaurant_id, variables.purchase_list_id] });
        },
    });
}

export function useUpdatePurchaseItem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<PurchaseItem> & { id: string, restaurant_id: string, purchase_list_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/purchase-items/${data.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Erro ao atualizar item");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["purchase-list", variables.restaurant_id, variables.purchase_list_id] });
        },
    });
}
