import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export type TaskStatus = 'todo' | 'doing' | 'done' | 'flagged' | 'skipped';

export interface KanbanTask { id: string; title: string; description?: string; checklist_id: string; role_id?: string; assigned_to_user_id?: string; is_critical?: boolean; requires_photo?: boolean; [key: string]: unknown; }
export interface KanbanExecution { id: string; task_id: string; status: TaskStatus; executed_at: string; notes?: string; [key: string]: unknown; }
export interface KanbanChecklist { id: string; name: string; is_required: boolean; recurrence?: string; last_reset_at?: string; assigned_to_user_id?: string; checklist_type?: string; role_id?: string; [key: string]: unknown; }

export interface KanbanData {
    checklists: KanbanChecklist[];
    tasks: KanbanTask[];
    executions: KanbanExecution[];
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useKanbanTasks = (restaurantId: string | undefined) => {
    return useQuery({
        queryKey: ['kanban', restaurantId],
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
