import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { ChecklistAssumption } from '@/lib/types';
import type { Scope } from '@/lib/types/scope';

export type TaskStatus = 'todo' | 'doing' | 'done' | 'flagged' | 'skipped' | 'blocked';

export interface KanbanTask {
    id: string;
    title: string;
    description?: string;
    checklist_id: string;
    role_id?: string;
    assigned_to_user_id?: string;
    is_critical?: boolean;
    requires_photo?: boolean;
    // Sprint 35
    type?: 'boolean' | 'date' | 'number' | 'rating' | null;
    requires_observation?: boolean;
    max_photos?: number | null;
    task_config?: { min_value?: number; max_value?: number } | null;
    [key: string]: unknown;
}
export interface KanbanExecution {
    id: string;
    task_id: string;
    status: TaskStatus;
    executed_at: string;
    notes?: string;
    photo_url?: string | null;
    requires_photo_snapshot?: boolean;
    blocked_reason?: string | null;
    blocked_at?: string | null;
    blocked_by_user_id?: string | null;
    checklist_assumption_id?: string | null;
    // Sprint 35
    photos?: string[];
    observation?: string | null;
    has_alert?: boolean;
    type_snapshot?: 'boolean' | 'date' | 'number' | 'rating' | null;
    requires_observation_snapshot?: boolean;
    max_photos_snapshot?: number | null;
    task_config_snapshot?: { min_value?: number; max_value?: number } | null;
    value_boolean?: boolean | null;
    value_date?: string | null;
    value_number?: number | null;
    value_rating?: number | null;
    [key: string]: unknown;
}
export interface KanbanChecklist { id: string; name: string; description?: string; is_required: boolean; recurrence?: string; last_reset_at?: string; assigned_to_user_id?: string; checklist_type?: string; role_id?: string; area_id?: string; order_index?: number | null; restaurant_id?: string; roles?: { id: string; name: string; color: string }; areas?: { id: string; name: string; color: string }; start_time?: string; end_time?: string; allow_early_start?: boolean; is_one_shot?: boolean | null; source_template_id?: string | null; supplier_id?: string | null; [key: string]: unknown; }

export interface KanbanData {
    checklists: KanbanChecklist[];
    tasks: KanbanTask[];
    executions: KanbanExecution[];
    assumptions: ChecklistAssumption[];
    units_by_id?: Record<string, { id: string; name: string }>;
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useKanbanTasks = (arg: string | undefined | Scope, userId?: string) => {
    const queryClient = useQueryClient();

    const scope: { mode: 'single' | 'global'; restaurantId?: string; accountId?: string } =
        typeof arg === 'object' && arg !== null
            ? (arg.mode === 'global' ? { mode: 'global', accountId: arg.accountId } : { mode: 'single', restaurantId: arg.restaurantId })
            : { mode: 'single', restaurantId: arg };
    const isGlobal = scope.mode === 'global';
    const enabled = isGlobal ? !!scope.accountId : !!scope.restaurantId;

    const query = useQuery({
        queryKey: isGlobal
            ? ['kanban', 'global', scope.accountId, userId]
            : ['kanban', scope.restaurantId, userId],
        queryFn: async () => {
            if (!enabled) return null;
            const token = await getAuthToken();
            const url = isGlobal
                ? `/api/tasks/kanban?account_id=${scope.accountId}&mode=global`
                : `/api/tasks/kanban?restaurant_id=${scope.restaurantId}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao buscar Kanban data');
            return response.json() as Promise<KanbanData>;
        },
        enabled,
        staleTime: 2 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    // Realtime: atualizar ao mudar assumptions ou execuções de tarefas
    // Em modo global, pular realtime (não há um único restaurant_id para filtrar)
    const singleRestaurantId = scope.restaurantId;
    useEffect(() => {
        if (!singleRestaurantId || isGlobal) return;

        const supabase = createClient();
        // Coalescing: com vários colaboradores ativos, mudanças em assumptions/executions
        // chegam em rajada. Agrupa numa única invalidação por janela para evitar refetch
        // storm do endpoint pesado de kanban.
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleInvalidate = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['kanban', singleRestaurantId] });
                queryClient.invalidateQueries({ queryKey: ['my-activities-badge', singleRestaurantId] });
            }, 800);
        };

        const channel = supabase
            .channel(`kanban-rt-${singleRestaurantId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'checklist_assumptions',
                    filter: `restaurant_id=eq.${singleRestaurantId}`,
                },
                scheduleInvalidate
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'task_executions',
                    filter: `restaurant_id=eq.${singleRestaurantId}`,
                },
                scheduleInvalidate
            )
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [singleRestaurantId, isGlobal, queryClient]);

    return query;
};

export const useChecklistAssumption = (restaurantId: string | undefined, checklistId: string | undefined) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['assumption', restaurantId, checklistId],
        queryFn: async () => {
            if (!restaurantId || !checklistId) return null;
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || '';
            const response = await fetch(
                `/api/checklists/${checklistId}/assume?restaurant_id=${restaurantId}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (!response.ok) return null;
            const json = await response.json();
            return json.assumption as ChecklistAssumption | null;
        },
        enabled: !!restaurantId && !!checklistId,
        staleTime: 30 * 1000,        // assumption de turno pode mudar entre colaboradores
    });

    // Realtime (Fase 1): a assunção/finalização (completed_at) pode mudar por outro
    // colaborador. Reusa o mesmo padrão de debounce (800ms) do kanban/my-activities.
    // checklist_assumptions só faz INSERT (assumir) + UPDATE (finalizar), sem DELETE,
    // então REPLICA IDENTITY DEFAULT entrega o NEW completo e o filtro por checklist_id
    // funciona. A propagação cross-tenant é barrada pela RLS, que o Realtime aplica.
    useEffect(() => {
        if (!restaurantId || !checklistId) return;

        const supabase = createClient();
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleInvalidate = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['assumption', restaurantId, checklistId] });
            }, 800);
        };

        const channel = supabase
            .channel(`assumption-rt-${checklistId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'checklist_assumptions',
                    filter: `checklist_id=eq.${checklistId}`,
                },
                scheduleInvalidate
            )
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [restaurantId, checklistId, queryClient]);

    return query;
};

export interface AssumeChecklistError {
    error: string;
    message?: string;
    code?: string;
}

export const useAssumeChecklist = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ restaurantId, checklistId }: { restaurantId: string; checklistId: string }) => {
            const token = await getAuthToken();
            const response = await fetch(`/api/checklists/${checklistId}/assume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ restaurant_id: restaurantId }),
            });
            if (!response.ok) {
                const errorData: AssumeChecklistError = await response.json().catch(() => ({ error: 'Erro ao assumir atividade' }));
                const err = new Error(errorData.message || errorData.error || 'Erro ao assumir atividade');
                (err as Error & { code?: string }).code = errorData.code;
                throw err;
            }
            return response.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['assumption', variables.restaurantId, variables.checklistId] });
            queryClient.invalidateQueries({ queryKey: ['kanban', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['my-activities', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['my-activities-badge', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['checklists', variables.restaurantId] });
        },
    });
};

export const useCompleteChecklist = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ restaurantId, checklistId, observation }: { restaurantId: string; checklistId: string; observation?: string }) => {
            const token = await getAuthToken();
            const response = await fetch(`/api/checklists/${checklistId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ restaurant_id: restaurantId, observation }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao finalizar atividade');
            }
            return response.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['assumption', variables.restaurantId, variables.checklistId] });
            queryClient.invalidateQueries({ queryKey: ['kanban', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["my-activities-badge", variables.restaurantId] });
            // Conclusão de execução de recebimento atualiza aba Execuções de /checklists.
            queryClient.invalidateQueries({ queryKey: ["receiving-executions", variables.restaurantId] });
        },
    });
};

export const useAssumeTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ restaurantId, taskId, checklistId }: { restaurantId: string; taskId: string; checklistId: string }) => {
            const token = await getAuthToken();
            const response = await fetch('/api/task-executions/assume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ restaurant_id: restaurantId, task_id: taskId, checklist_id: checklistId }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao assumir a tarefa');
            }
            return response.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['kanban', variables.restaurantId] });
        },
    });
};

export interface UpdateTaskStatusInput {
    restaurantId: string;
    executionId: string;
    status: TaskStatus;
    notes?: string;
    photo_url?: string;
    // Sprint 35
    photos?: string[];
    observation?: string;
    value_boolean?: boolean;
    value_date?: string;
    value_number?: number;
    value_rating?: number;
}

export const useUpdateTaskStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: UpdateTaskStatusInput) => {
            const { restaurantId, executionId, ...rest } = input;
            const token = await getAuthToken();
            const response = await fetch(`/api/task-executions/${executionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ restaurant_id: restaurantId, ...rest }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao alterar a tarefa');
            }
            return response.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['kanban', variables.restaurantId] });
        },
    });
};
