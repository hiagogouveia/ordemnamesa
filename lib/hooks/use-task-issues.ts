import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TaskIssue, TaskIssueEvent, TaskIssueStatus } from '@/lib/types';

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

// ============================================================
// Listagem de ocorrências (com filtros)
// ============================================================
export interface UseTaskIssuesArgs {
    restaurantId: string | undefined;
    checklistId?: string;
    checklistAssumptionId?: string;
    status?: TaskIssueStatus;
}

export const useTaskIssues = ({ restaurantId, checklistId, checklistAssumptionId, status }: UseTaskIssuesArgs) => {
    return useQuery<TaskIssue[]>({
        queryKey: ['task-issues', restaurantId, { checklistId, checklistAssumptionId, status }],
        enabled: !!restaurantId,
        queryFn: async () => {
            const token = await getAuthToken();
            const params = new URLSearchParams({ restaurant_id: restaurantId! });
            if (checklistId) params.set('checklist_id', checklistId);
            if (checklistAssumptionId) params.set('checklist_assumption_id', checklistAssumptionId);
            if (status) params.set('status', status);
            const res = await fetch(`/api/task-issues?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao buscar ocorrências');
            const data = await res.json();
            return data.issues as TaskIssue[];
        },
    });
};

// ============================================================
// Contagens agregadas (badges) — {checklist_id: open_count}
// ============================================================
export const useIssueCountsByChecklist = (restaurantId: string | undefined, date_key?: string) => {
    return useQuery<Record<string, number>>({
        queryKey: ['task-issues', 'counts', restaurantId, date_key ?? 'all'],
        enabled: !!restaurantId,
        queryFn: async () => {
            const token = await getAuthToken();
            const params = new URLSearchParams({ restaurant_id: restaurantId!, aggregate: 'counts_by_checklist' });
            if (date_key) params.set('date_key', date_key);
            const res = await fetch(`/api/task-issues?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao agregar ocorrências');
            const data = await res.json();
            return (data.counts ?? {}) as Record<string, number>;
        },
    });
};

// ============================================================
// Timeline de eventos
// ============================================================
export const useIssueTimeline = (issueId: string | undefined) => {
    return useQuery<TaskIssueEvent[]>({
        queryKey: ['task-issues', 'events', issueId],
        enabled: !!issueId,
        queryFn: async () => {
            const token = await getAuthToken();
            const res = await fetch(`/api/task-issues/${issueId}/events`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao buscar timeline');
            const data = await res.json();
            return data.events as TaskIssueEvent[];
        },
    });
};

// ============================================================
// Mutation: criar ocorrência (staff/manager/owner)
// ============================================================
export interface ReportIssueArgs {
    restaurant_id: string;
    task_id: string;
    checklist_id: string;
    checklist_assumption_id?: string | null;
    task_execution_id?: string | null;
    description: string;
    photos?: string[];
}

export const useReportIssue = () => {
    const queryClient = useQueryClient();
    return useMutation<TaskIssue, Error, ReportIssueArgs>({
        mutationFn: async (args) => {
            const token = await getAuthToken();
            const res = await fetch('/api/task-issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(args),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao registrar ocorrência');
            const data = await res.json();
            return data.issue as TaskIssue;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['task-issues', variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ['task-issues', 'counts', variables.restaurant_id] });
        },
    });
};

// ============================================================
// Mutation: atualizar status / comentário (manager/owner)
// ============================================================
export interface UpdateIssueArgs {
    id: string;
    restaurantId: string;
    status?: TaskIssueStatus;
    manager_comment?: string;
    /** Apenas o autor pode editar, e só enquanto status='open' */
    description?: string;
    /** Apenas o autor pode editar, e só enquanto status='open' */
    photos?: string[];
}

export const useUpdateIssue = () => {
    const queryClient = useQueryClient();
    return useMutation<TaskIssue, Error, UpdateIssueArgs>({
        mutationFn: async ({ id, status, manager_comment, description, photos }) => {
            const token = await getAuthToken();
            const res = await fetch(`/api/task-issues/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, manager_comment, description, photos }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao atualizar ocorrência');
            const data = await res.json();
            return data.issue as TaskIssue;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['task-issues', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['task-issues', 'counts', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['task-issues', 'events', variables.id] });
        },
    });
};
