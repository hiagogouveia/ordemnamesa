import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { ChecklistAssumption } from '@/lib/types';

export type TaskStatus = 'todo' | 'doing' | 'done' | 'flagged' | 'skipped';

export interface KanbanTask { id: string; title: string; description?: string; checklist_id: string; role_id?: string; assigned_to_user_id?: string; is_critical?: boolean; requires_photo?: boolean; [key: string]: unknown; }
export interface KanbanExecution { id: string; task_id: string; status: TaskStatus; executed_at: string; notes?: string; photo_url?: string; requires_photo_snapshot?: boolean; [key: string]: unknown; }
export interface KanbanChecklist { id: string; name: string; description?: string; is_required: boolean; recurrence?: string; last_reset_at?: string; assigned_to_user_id?: string; checklist_type?: string; role_id?: string; area_id?: string; roles?: { id: string; name: string; color: string }; areas?: { id: string; name: string; color: string }; start_time?: string; end_time?: string; [key: string]: unknown; }

export interface KanbanData {
    checklists: KanbanChecklist[];
    tasks: KanbanTask[];
    executions: KanbanExecution[];
    assumptions: ChecklistAssumption[];
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useKanbanTasks = (restaurantId: string | undefined, userId?: string) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['kanban', restaurantId, userId],
        queryFn: async () => {
            if (!restaurantId) return null;
            const token = await getAuthToken();
            const response = await fetch(`/api/tasks/kanban?restaurant_id=${restaurantId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao buscar Kanban data');
            return response.json() as Promise<KanbanData>;
        },
        enabled: !!restaurantId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: true,
    });

    // Realtime: atualizar ao mudar assumptions ou execuções de tarefas
    useEffect(() => {
        if (!restaurantId) return;

        const supabase = createClient();
        const channel = supabase
            .channel(`kanban-rt-${restaurantId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'checklist_assumptions',
                    filter: `restaurant_id=eq.${restaurantId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['kanban', restaurantId] });
                    queryClient.invalidateQueries({ queryKey: ['my-activities-badge', restaurantId] });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'task_executions',
                    filter: `restaurant_id=eq.${restaurantId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['kanban', restaurantId] });
                    queryClient.invalidateQueries({ queryKey: ['my-activities-badge', restaurantId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [restaurantId, queryClient]);

    return query;
};

export const useChecklistAssumption = (restaurantId: string | undefined, checklistId: string | undefined) => {
    return useQuery({
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
        refetchOnWindowFocus: true,
    });
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

export const useUpdateTaskStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ restaurantId, executionId, status, notes, photo_url }: { restaurantId: string; executionId: string; status: TaskStatus; notes?: string; photo_url?: string }) => {
            const token = await getAuthToken();
            const response = await fetch(`/api/task-executions/${executionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ restaurant_id: restaurantId, status, notes, photo_url }),
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
