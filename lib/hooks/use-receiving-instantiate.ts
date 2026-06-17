import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

export interface InstantiateReceivingVars {
    restaurant_id: string;
    template_id: string;
    supplier_id?: string;
    supplier_new?: { name: string; cnpj?: string };
    /**
     * UUID gerado pelo caller — deve ser estável durante toda a vida do modal
     * (não regenerar a cada clique). O hook não gera automaticamente porque
     * cada caller precisa controlar quando "abre uma nova intenção".
     */
    idempotency_key: string;
}

export interface InstantiateReceivingResult {
    checklist_id: string;
    assumption_id: string;
    was_duplicate: boolean;
}

export function useInstantiateReceiving() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: InstantiateReceivingVars): Promise<InstantiateReceivingResult> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/receiving/instantiate", {
                method: "POST",
                headers,
                body: JSON.stringify(vars),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const e = new Error(err.error || "Erro ao instanciar recebimento.");
                (e as Error & { code?: string }).code = err.code;
                throw e;
            }
            return res.json();
        },
        onSuccess: (_d, vars) => {
            // Nova execução aparece em Meu Turno + My Activities + badge.
            queryClient.invalidateQueries({ queryKey: ["kanban", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities-badge", vars.restaurant_id] });
            // E na aba Execuções do módulo de Recebimentos.
            queryClient.invalidateQueries({ queryKey: ["receiving-executions", vars.restaurant_id] });
            // Fornecedor pode ter sido criado inline.
            if (vars.supplier_new) {
                queryClient.invalidateQueries({ queryKey: ["suppliers", vars.restaurant_id] });
                queryClient.invalidateQueries({ queryKey: ["suppliers-all", vars.restaurant_id] });
            }
        },
    });
}
