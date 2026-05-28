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

export type ReceivingCounts = { pending: number; overdue: number; confirmed: number; cancelled: number };

export function useReceivingCounts(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["receiving-counts", restaurantId],
        queryFn: async (): Promise<ReceivingCounts> => {
            if (!restaurantId) return { pending: 0, overdue: 0, confirmed: 0, cancelled: 0 };
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/receiving-expectations/counts?restaurant_id=${restaurantId}`, { headers });
            if (!res.ok) return { pending: 0, overdue: 0, confirmed: 0, cancelled: 0 };
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 30 * 1000,
    });
}

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

/** Confirma uma expectativa (gestor) — libera para Meu Turno. */
export function useConfirmExpectation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { id: string; restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/receiving-expectations/${input.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ restaurant_id: input.restaurant_id, action: "confirm" }),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error || "Erro ao confirmar recebimento");
            }
            return res.json();
        },
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["receiving-expectations", vars.restaurant_id] });
            qc.invalidateQueries({ queryKey: ["receiving-counts", vars.restaurant_id] });
        },
    });
}

/** Cancela uma expectativa (gestor). Não cancela se já tem execução em curso. */
export function useCancelExpectation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { id: string; restaurant_id: string; reason?: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/receiving-expectations/${input.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    restaurant_id: input.restaurant_id,
                    action: "cancel",
                    cancelled_reason: input.reason,
                }),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error || "Erro ao cancelar recebimento");
            }
            return res.json();
        },
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["receiving-expectations", vars.restaurant_id] });
            qc.invalidateQueries({ queryKey: ["receiving-counts", vars.restaurant_id] });
        },
    });
}

/** Sweeper de overdue: chamado pelo inbox admin ao abrir. */
export function useMarkOverdue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/receiving-expectations/mark-overdue`, {
                method: "POST",
                headers,
                body: JSON.stringify(input),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error || "Erro ao recalcular atrasados");
            }
            return res.json() as Promise<{ marked: number; notified: number }>;
        },
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["receiving-expectations", vars.restaurant_id] });
            qc.invalidateQueries({ queryKey: ["receiving-counts", vars.restaurant_id] });
        },
    });
}

export type QuickReceivingHistoryItem = {
    checklist_id: string;
    name: string;
    supplier_name: string | null;
    area_id: string | null;
    area: { id: string; name: string; color: string } | null;
    active: boolean;
    is_one_shot: boolean;
    created_at: string;
    assumed_at: string | null;
    completed_at: string | null;
    assumed_by_user_id: string | null;
    assumed_by_user_name: string | null;
    tasks_total: number;
    tasks_completed: number;
};

export type QuickReceivingStatusFilter = 'all' | 'in_progress' | 'completed';

/**
 * Histórico administrativo de recebimentos rápidos. Reusado pela aba
 * "Rápidos" em /admin/recebimentos. Owner/manager apenas.
 */
export function useQuickReceivingHistory(
    restaurantId: string | undefined,
    opts?: { days?: number; status?: QuickReceivingStatusFilter },
) {
    return useQuery({
        queryKey: ["receiving-quick-history", restaurantId, opts?.days, opts?.status],
        queryFn: async (): Promise<QuickReceivingHistoryItem[]> => {
            if (!restaurantId) return [];
            const params = new URLSearchParams({ restaurant_id: restaurantId });
            if (opts?.days) params.set('days', String(opts.days));
            if (opts?.status) params.set('status', opts.status);
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/receiving/quick/history?${params.toString()}`, { headers });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error || "Erro ao buscar histórico");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 60 * 1000,
    });
}

/**
 * Cria um recebimento rápido (one-shot) — usado pelo modal "Novo recebimento"
 * quando o colaborador precisa registrar uma entrega sem template configurado.
 * O endpoint /api/receiving/quick cria checklist + tasks + assumption em
 * transação compensada (rollback explícito se algum passo falhar).
 */
export function useCreateQuickReceiving() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: {
            restaurant_id: string;
            area_id: string;
            supplier_name?: string;
            tasks: Array<{ title: string }>;
        }) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/receiving/quick", {
                method: "POST",
                headers,
                body: JSON.stringify(input),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error || "Erro ao criar recebimento rápido");
            }
            return res.json() as Promise<{ checklist_id: string; assumption_id: string; name: string }>;
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ["kanban", vars.restaurant_id] });
            qc.invalidateQueries({ queryKey: ["my-activities", vars.restaurant_id] });
            qc.invalidateQueries({ queryKey: ["receiving-expectations", vars.restaurant_id] });
            qc.invalidateQueries({ queryKey: ["receiving-quick-history", vars.restaurant_id] });
        },
    });
}

