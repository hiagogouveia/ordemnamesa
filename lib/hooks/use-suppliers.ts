import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "@/lib/types";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    return headers;
}

/** Lista fornecedores ativos. Usado no picker do colaborador. */
export function useSuppliers(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["suppliers", restaurantId],
        queryFn: async (): Promise<Supplier[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/suppliers?restaurant_id=${restaurantId}`,
                { headers, cache: "no-store" },
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar fornecedores.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 5 * 60 * 1000,
    });
}

/** Lista todos os fornecedores incluindo arquivados (owner/manager). */
export function useAllSuppliers(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["suppliers-all", restaurantId],
        queryFn: async (): Promise<Supplier[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/suppliers?restaurant_id=${restaurantId}&include_inactive=true`,
                { headers, cache: "no-store" },
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar fornecedores.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 5 * 60 * 1000,
    });
}

interface CreateSupplierVariables {
    restaurant_id: string;
    name: string;
    cnpj?: string | null;
}

export function useCreateSupplier() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateSupplierVariables): Promise<Supplier> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/suppliers", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao criar fornecedor.");
            }
            return res.json();
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ["suppliers", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["suppliers-all", vars.restaurant_id] });
        },
    });
}

interface UpdateSupplierVariables {
    id: string;
    restaurant_id: string;
    name?: string;
    cnpj?: string | null;
    active?: boolean;
}

export function useUpdateSupplier() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: UpdateSupplierVariables): Promise<Supplier> => {
            const headers = await getAuthHeaders();
            const { id, ...body } = vars;
            const res = await fetch(`/api/suppliers/${id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao atualizar fornecedor.");
            }
            return res.json();
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ["suppliers", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["suppliers-all", vars.restaurant_id] });
        },
    });
}

export function useArchiveSupplier() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: { id: string; restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/suppliers/${vars.id}?restaurant_id=${vars.restaurant_id}`,
                { method: "DELETE", headers },
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao arquivar fornecedor.");
            }
            return res.json();
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ["suppliers", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["suppliers-all", vars.restaurant_id] });
        },
    });
}
