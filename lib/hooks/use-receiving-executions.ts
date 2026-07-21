import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

export type ReceivingExecutionStatusFilter = "all" | "in_progress" | "completed";

export interface ReceivingExecutionRow {
    checklist_id: string;
    name: string;
    supplier: { id: string; name: string } | null;
    source_template_id: string | null;
    area_id: string | null; // s92 — DEPRECADO (sombra); ver `areas`
    area: { id: string; name: string; color: string } | null; // s92 — DEPRECADO
    /** s92 — todas as áreas do recebimento, ordenadas por nome. */
    areas: { id: string; name: string; color: string }[];
    active: boolean;
    is_one_shot: boolean;
    created_at: string;
    assumed_at: string | null;
    completed_at: string | null;
    assumed_by_user_id: string | null;
    assumed_by_user_name: string | null;
    tasks_total: number;
    tasks_completed: number;
}

/**
 * Histórico admin de execuções de recebimento (instanciadas via templates
 * ou legacy one-shots). Substitui useQuickReceivingHistory.
 */
export function useReceivingExecutions(
    restaurantId: string | undefined,
    options: { days?: number; status?: ReceivingExecutionStatusFilter } = {},
) {
    const { days = 30, status = "all" } = options;
    return useQuery({
        queryKey: ["receiving-executions", restaurantId, days, status],
        queryFn: async (): Promise<ReceivingExecutionRow[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const url = `/api/receiving/executions?restaurant_id=${restaurantId}&days=${days}&status=${status}`;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar execuções de recebimento.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 60 * 1000,
    });
}
