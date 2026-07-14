import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Checklist } from "../types";

interface TaskOrderEntry {
    id: string;
    order: number;
}

interface ReorderTasksVariables {
    checklistId: string;
    restaurantId: string;
    taskOrders: TaskOrderEntry[];
}
import { createClient } from "@/lib/supabase/client";
import type { Scope } from "@/lib/types/scope";
import { BillingError } from "@/lib/billing/client-errors";

export type { Scope };

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

/** @deprecated Usar Scope de lib/types/scope.ts */
export interface ChecklistsScope {
    restaurantId: string | null | undefined;
    accountId?: string | null;
    mode?: 'single' | 'global';
}

// Buscar Checklists com Realtime para assumptions
export function useChecklists(arg: string | undefined | ChecklistsScope) {
    const queryClient = useQueryClient();
    const scope: ChecklistsScope = typeof arg === 'object' && arg !== null
        ? arg
        : { restaurantId: arg, mode: 'single' };
    const isGlobal = scope.mode === 'global';
    const enabled = isGlobal ? !!scope.accountId : !!scope.restaurantId;
    const queryKey = isGlobal
        ? ["checklists", "global", scope.accountId]
        : ["checklists", scope.restaurantId];

    const query = useQuery({
        queryKey,
        queryFn: async (): Promise<Checklist[]> => {
            if (!enabled) return [];
            const headers = await getAuthHeaders();
            const url = isGlobal
                ? `/api/checklists?account_id=${scope.accountId}&mode=global`
                : `/api/checklists?restaurant_id=${scope.restaurantId}`;
            const res = await fetch(url, { headers, cache: 'no-store' });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao buscar checklists");
            }
            return res.json();
        },
        enabled,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        placeholderData: keepPreviousData,
    });

    // Realtime: atualizar quando assumptions mudam (alguém assumiu/completou)
    // Em global mode não assinamos — invalidação por restaurant_id specifico
    // não cobre as várias unidades e realtime multi-filter não é suportado aqui.
    useEffect(() => {
        if (isGlobal || !scope.restaurantId) return;
        const restaurantId = scope.restaurantId;

        const supabase = createClient();
        // Coalescing: agrupa rajadas de mudanças em assumptions numa única invalidação.
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleInvalidate = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ["checklists", restaurantId] });
            }, 800);
        };

        const channel = supabase
            .channel(`checklists-rt-${restaurantId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'checklist_assumptions',
                    filter: `restaurant_id=eq.${restaurantId}`,
                },
                scheduleInvalidate
            )
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [isGlobal, scope.restaurantId, queryClient]);

    return query;
}

// Buscar status diário para o Admin (Assumptions + Checklists)
export function useAdminChecklistsStatus(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["admin_checklists_status", restaurantId],
        queryFn: async () => {
            if (!restaurantId) return null;
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/admin/checklists?restaurant_id=${restaurantId}`, {
                headers,
            });

            if (!res.ok) {
                throw new Error('Falha ao buscar status diário dos checklists');
            }

            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 2 * 60 * 1000,    // considera fresco por 2 min
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
                if (res.status === 402 && errData?.reason) {
                    throw new BillingError(errData.error ?? "Acesso bloqueado pelo plano.", res.status, errData.reason);
                }
                throw new Error(errData.error || "Erro ao criar checklist");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["kanban", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities-badge", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", variables.restaurant_id] });
        },
    });
}

// Atualizar Checklist
export function useUpdateChecklist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: Partial<Checklist> & { id: string, skipInvalidation?: boolean }) => {
            const headers = await getAuthHeaders();
            // Remove skipInvalidation properties before sending to backend
            const { skipInvalidation, ...payloadData } = data;
            const res = await fetch(`/api/checklists/${data.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(payloadData),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (res.status === 402 && errData?.reason) {
                    throw new BillingError(errData.error ?? "Acesso bloqueado pelo plano.", res.status, errData.reason);
                }
                throw new Error(errData.error || "Erro ao atualizar checklist");
            }
            return res.json();
        },
        onSuccess: (updatedChecklist, variables) => {
            // Patch de todas as listas de rotinas em cache que contenham este item.
            //
            // Por prefixo, porque há duas: ["checklists", restaurantId] (visão da unidade) e
            // ["checklists", "global", accountId] (visão multi-unidade). Antes, só a primeira era
            // tocada — na visão global a listagem não refletia o save.
            //
            // A resposta do PUT tem o mesmo shape do GET (fetchChecklistViews), então substituir o
            // item é seguro: `area`, `shifts`, `responsible` e o status vêm completos. Enquanto o
            // PUT devolvia um objeto parcial, esta linha era a origem do flicker "Sem área".
            queryClient.setQueriesData(
                { queryKey: ["checklists"] },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (old: any) => {
                    if (!Array.isArray(old)) return old;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return old.map((c: any) => c.id === updatedChecklist.id ? updatedChecklist : c);
                }
            );
            if (!variables.skipInvalidation) {
                queryClient.invalidateQueries({ queryKey: ["checklists"] });
                queryClient.invalidateQueries({ queryKey: ["kanban", variables.restaurant_id] });
                queryClient.invalidateQueries({ queryKey: ["my-activities", variables.restaurant_id] });
                queryClient.invalidateQueries({ queryKey: ["my-activities-badge", variables.restaurant_id] });
                queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", variables.restaurant_id] });
            }
        },
    });
}

// ─── TRANSFERIR RESPONSÁVEL (em lote) ───────────────────────────────────────

export interface TransferResponsibleVariables {
    restaurant_id: string;
    checklist_ids: string[];
    to_user_id: string;
}

export interface TransferResponsibleResponse {
    transferred_count: number;
    checklist_ids: string[];
    from_user_id: string;
    to_user_id: string;
}

/** Erro de transferência que preserva a lista de rotinas bloqueadas por turno. */
export class TransferResponsibleError extends Error {
    code?: string;
    blockedRoutines?: string[];
    constructor(message: string, code?: string, blockedRoutines?: string[]) {
        super(message);
        this.name = "TransferResponsibleError";
        this.code = code;
        this.blockedRoutines = blockedRoutines;
    }
}

/**
 * Transfere o responsável direto de várias rotinas para outro colaborador da
 * mesma área. A operação é atômica no backend (UPDATE em lote) e altera apenas
 * `assigned_to_user_id`.
 */
export function useTransferChecklistResponsible() {
    const queryClient = useQueryClient();

    return useMutation<TransferResponsibleResponse, Error, TransferResponsibleVariables>({
        mutationFn: async (data) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklists/transfer-responsible", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (res.status === 402 && errData?.reason) {
                    throw new BillingError(errData.error ?? "Acesso bloqueado pelo plano.", res.status, errData.reason);
                }
                throw new TransferResponsibleError(
                    errData.error || "Erro ao transferir responsável",
                    errData.code,
                    errData.blocked_routines
                );
            }
            return res.json();
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["kanban", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["my-activities-badge", variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", variables.restaurant_id] });
        },
    });
}

// Reordenar Tarefas de um Checklist
export function useReorderTasks() {
    const queryClient = useQueryClient();

    return useMutation<void, Error, ReorderTasksVariables>({
        mutationFn: async ({ checklistId, restaurantId, taskOrders }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/checklists/${checklistId}/tasks/reorder`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    restaurant_id: restaurantId,
                    task_orders: taskOrders,
                }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Erro ao reordenar tarefas');
            }
        },
        onSuccess: (_, { restaurantId }) => {
            queryClient.invalidateQueries({ queryKey: ['checklists', restaurantId] });
        },
    });
}

// Toggle status ativo/inativo de um Checklist (Sprint 14)
export function useToggleChecklistStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            restaurantId,
            active,
        }: {
            id: string;
            restaurantId: string;
            active: boolean;
        }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/checklists/${id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ restaurant_id: restaurantId, active }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao atualizar status do checklist");
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", variables.restaurantId] });
        },
    });
}

// Replicar Checklists entre unidades da mesma account (Sprint 29)
export interface ReplicateChecklistsVariables {
    checklist_ids: string[];
    target_restaurant_ids: string[];
}

export interface ReplicationResultRow {
    target_restaurant_id: string;
    source_checklist_id: string;
    status: 'created' | 'skipped' | 'error';
    new_checklist_id: string | null;
    error_message: string | null;
}

export interface ReplicationResponse {
    results: ReplicationResultRow[];
    summary: { created: number; skipped: number; errors: number };
}

export function useReplicateChecklists() {
    const queryClient = useQueryClient();

    return useMutation<ReplicationResponse, Error, ReplicateChecklistsVariables>({
        mutationFn: async ({ checklist_ids, target_restaurant_ids }) => {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/checklists/replicate', {
                method: 'POST',
                headers,
                body: JSON.stringify({ checklist_ids, target_restaurant_ids }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Erro ao replicar checklists');
            }
            return res.json();
        },
        onSuccess: (data) => {
            const touched = new Set(data.results.map((r) => r.target_restaurant_id));
            touched.forEach((rid) => {
                queryClient.invalidateQueries({ queryKey: ['checklists', rid] });
                queryClient.invalidateQueries({ queryKey: ['admin_checklists_status', rid] });
            });
            queryClient.invalidateQueries({ queryKey: ['checklists', 'global'] });
        },
    });
}

// Deletar Checklist (Hard Delete — cascata no banco remove todos os dados derivados; s75)
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
