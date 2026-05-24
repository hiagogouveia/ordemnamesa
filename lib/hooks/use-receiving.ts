import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ReceivingExpectation } from "@/lib/types";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

export type ReceivingExpectationWithChecklist = ReceivingExpectation & {
    checklist?: {
        id: string;
        name: string;
        supplier_name?: string | null;
        area_id?: string | null;
        area?: { id: string; name: string; color: string } | null;
    } | null;
};

export type ReceivingTemplate = {
    id: string;
    name: string;
    supplier_name?: string | null;
    area_id?: string | null;
    receiving_mode?: 'on_demand' | 'recurring' | null;
    area?: { id: string; name: string; color: string } | null;
};

export function useReceivingExpectations(
    restaurantId: string | undefined,
    opts?: { date?: string; status?: string },
) {
    return useQuery({
        queryKey: ["receiving-expectations", restaurantId, opts?.date, opts?.status],
        queryFn: async (): Promise<ReceivingExpectationWithChecklist[]> => {
            if (!restaurantId) return [];
            const params = new URLSearchParams({ restaurant_id: restaurantId });
            if (opts?.date) params.set("date", opts.date);
            if (opts?.status) params.set("status", opts.status);
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/receiving-expectations?${params.toString()}`, { headers });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error || "Erro ao buscar recebimentos");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 60 * 1000,
    });
}

export function useReceivingTemplates(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["receiving-templates", restaurantId],
        queryFn: async (): Promise<ReceivingTemplate[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/receiving/templates?restaurant_id=${restaurantId}`, { headers });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error || "Erro ao buscar modelos de recebimento");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Inicia (ou recupera) a assumption de um recebimento. Reaproveita o endpoint
 * de assume — não há engine paralela de execução. Quando vem de uma expectativa
 * já materializada, passa expectation_id para o backend ligar o registro.
 */
export function useStartReceiving() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { checklist_id: string; restaurant_id: string; expectation_id?: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/checklists/${input.checklist_id}/assume`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    restaurant_id: input.restaurant_id,
                    expectation_id: input.expectation_id,
                }),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.message || e.error || "Erro ao iniciar recebimento");
            }
            return res.json() as Promise<{ assumption: { id: string }; alreadyAssumed: boolean }>;
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ["receiving-expectations", vars.restaurant_id] });
        },
    });
}
