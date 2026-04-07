import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { KanbanTask, KanbanExecution, KanbanChecklist } from './use-tasks';

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export interface ActivityData {
    checklist: KanbanChecklist;
    tasks: KanbanTask[];
    executions: KanbanExecution[];
}


export const useActivityData = (restaurantId: string | undefined, checklistId: string | undefined) => {
    const queryClient = useQueryClient();
    const supabase = createClient();

    const fetchActivityData = async (): Promise<ActivityData | null> => {
        if (!restaurantId || !checklistId) return null;
        
        // Fetch checklist details
        const { data: checklist, error: checklistErr } = await supabase
            .from('checklists')
            .select('*')
            .eq('id', checklistId)
            .eq('restaurant_id', restaurantId)
            .single();

        if (checklistErr || !checklist) throw new Error('Atividade não encontrada');

        // Fetch tasks
        const { data: tasks, error: tasksErr } = await supabase
            .from('checklist_tasks')
            .select('*')
            .eq('checklist_id', checklistId)
            .eq('restaurant_id', restaurantId)
            .order('order', { ascending: true });

        if (tasksErr) throw new Error('Erro ao buscar tarefas');

        // Fetch today's executions
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const { data: executions, error: execErr } = await supabase
            .from('task_executions')
            .select('*')
            .eq('checklist_id', checklistId)
            .eq('restaurant_id', restaurantId)
            .gte('executed_at', startOfDay.toISOString());

        if (execErr) throw new Error('Erro ao buscar execuções');

        return {
            checklist: checklist as KanbanChecklist,
            tasks: tasks as KanbanTask[],
            executions: executions as KanbanExecution[],
        };
    };

    const queryKey = ['activity', restaurantId, checklistId];

    const result = useQuery({
        queryKey,
        queryFn: fetchActivityData,
        enabled: !!restaurantId && !!checklistId,
    });

    // Setup Realtime Subscription
    useEffect(() => {
        if (!restaurantId || !checklistId) return;

        const channel = supabase
            .channel(`activity_${checklistId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'task_executions',
                    filter: `checklist_id=eq.${checklistId}`,
                },
                (payload) => {
                    // Update the cache intelligently instead of full refetch to avoid flicker
                    queryClient.setQueryData<ActivityData | null>(queryKey, (old) => {
                        if (!old) return old;
                        
                        let newExecutions = [...old.executions];
                        if (payload.eventType === 'INSERT') {
                            // Remove optimistic record for this task (id starts with 'optimistic-')
                            newExecutions = newExecutions.filter(
                                e => !(String(e.id).startsWith('optimistic-') && e.task_id === payload.new.task_id)
                            );
                            // Add real record if not already present
                            if (!newExecutions.some(e => e.id === payload.new.id)) {
                                newExecutions.push(payload.new as KanbanExecution);
                            }
                        } else if (payload.eventType === 'UPDATE') {
                            newExecutions = newExecutions.map(e => 
                                e.id === payload.new.id ? { ...e, ...(payload.new as KanbanExecution) } : e
                            );
                        } else if (payload.eventType === 'DELETE') {
                            newExecutions = newExecutions.filter(e => e.id !== payload.old.id);
                        }

                        return { ...old, executions: newExecutions };
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [restaurantId, checklistId, queryClient, queryKey, supabase]);

    return result;
};

export const useToggleActivityTask = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ restaurantId, checklistId, taskId, executionId, isDone, photoUrl, requiresPhoto }: {
            restaurantId: string;
            checklistId: string;
            taskId: string;
            executionId?: string;
            isDone: boolean;
            photoUrl?: string;
            requiresPhoto?: boolean;
        }) => {
            // Bloquear conclusão de task que exige foto sem foto
            if (isDone && requiresPhoto && !photoUrl) {
                throw new Error('Essa tarefa exige uma foto.');
            }

            const supabase = createClient();

            if (isDone) {
                if (executionId) {
                    const updatePayload: Record<string, unknown> = {
                        status: 'done',
                        executed_at: new Date().toISOString(),
                    };
                    if (photoUrl !== undefined) updatePayload.photo_url = photoUrl;
                    if (requiresPhoto !== undefined) updatePayload.requires_photo_snapshot = requiresPhoto;

                    const { data, error } = await supabase
                        .from('task_executions')
                        .update(updatePayload)
                        .eq('id', executionId)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                } else {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error("Usuário não logado");

                    const { data, error } = await supabase
                        .from('task_executions')
                        .insert({
                            restaurant_id: restaurantId,
                            task_id: taskId,
                            checklist_id: checklistId,
                            user_id: user.id,
                            status: 'done',
                            executed_at: new Date().toISOString(),
                            photo_url: photoUrl ?? null,
                            requires_photo_snapshot: requiresPhoto ?? false,
                        })
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            } else {
                // To uncheck: delete the execution record (no record = task not done)
                let realExecutionId = executionId;
                if (!realExecutionId || String(realExecutionId).startsWith('optimistic-')) {
                    // Look up the real execution from the DB
                    const { data: exec } = await supabase
                        .from('task_executions')
                        .select('id')
                        .eq('task_id', taskId)
                        .eq('checklist_id', checklistId)
                        .eq('status', 'done')
                        .maybeSingle();
                    realExecutionId = exec?.id;
                }
                if (realExecutionId) {
                    const { error } = await supabase
                        .from('task_executions')
                        .delete()
                        .eq('id', realExecutionId);
                    if (error) throw error;
                    return { deleted: true, taskId };
                }
            }
        },
        onMutate: async (variables) => {
            const queryKey = ['activity', variables.restaurantId, variables.checklistId];
            await queryClient.cancelQueries({ queryKey });

            const previousData = queryClient.getQueryData<ActivityData>(queryKey);

            // Optimistic update
            if (previousData) {
                queryClient.setQueryData<ActivityData>(queryKey, (old) => {
                    if (!old) return old;
                    let newExecs = [...old.executions];

                    if (variables.isDone) {
                        if (variables.executionId) {
                            newExecs = newExecs.map(e => e.id === variables.executionId
                                ? { ...e, status: 'done', photo_url: variables.photoUrl ?? e.photo_url }
                                : e
                            );
                        } else {
                            // Fake execution ID for optimistic UI
                            newExecs.push({
                                id: `optimistic-${Date.now()}`,
                                task_id: variables.taskId,
                                status: 'done',
                                executed_at: new Date().toISOString(),
                                photo_url: variables.photoUrl ?? null,
                                requires_photo_snapshot: variables.requiresPhoto ?? false,
                            } as KanbanExecution);
                        }
                    } else {
                        // Remove the execution record (uncheck = delete)
                        newExecs = newExecs.filter(e => e.id !== variables.executionId && e.task_id !== variables.taskId);
                    }

                    return { ...old, executions: newExecs };
                });
            }

            return { previousData, queryKey };
        },
        onError: (_err, _variables, context) => {
            // Revert on error
            if (context?.previousData) {
                queryClient.setQueryData(context.queryKey, context.previousData);
            }
        },
        onSettled: (_data, _error, variables) => {
            // Invalidate to make sure we have the truth from DB
            // However, Realtime will mostly handle this. We can trigger a soft invalidate.
            queryClient.invalidateQueries({ queryKey: ['activity', variables.restaurantId, variables.checklistId] });
        }
    });
};

export const useBlockTask = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ restaurantId, checklistId, taskId, reason }: {
            restaurantId: string;
            checklistId: string;
            taskId: string;
            reason: string;
        }) => {
            const token = await getAuthToken();
            const response = await fetch(`/api/checklists/${checklistId}/tasks/${taskId}/block`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ restaurant_id: restaurantId, reason }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao reportar problema');
            }
            return response.json();
        },
        onMutate: async (variables) => {
            const queryKey = ['activity', variables.restaurantId, variables.checklistId];
            await queryClient.cancelQueries({ queryKey });

            const previousData = queryClient.getQueryData<ActivityData>(queryKey);

            // Optimistic update: marcar task como blocked
            if (previousData) {
                queryClient.setQueryData<ActivityData>(queryKey, (old) => {
                    if (!old) return old;
                    let newExecs = [...old.executions];

                    // Remover execução existente para essa task (se houver)
                    newExecs = newExecs.filter(e => e.task_id !== variables.taskId);

                    // Adicionar execução blocked otimista
                    newExecs.push({
                        id: `optimistic-blocked-${Date.now()}`,
                        task_id: variables.taskId,
                        status: 'blocked',
                        executed_at: new Date().toISOString(),
                        blocked_reason: variables.reason,
                        blocked_at: new Date().toISOString(),
                        photo_url: null,
                    } as KanbanExecution);

                    return { ...old, executions: newExecs };
                });
            }

            return { previousData, queryKey };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(context.queryKey, context.previousData);
            }
        },
        onSettled: (_data, _error, variables) => {
            queryClient.invalidateQueries({ queryKey: ['activity', variables.restaurantId, variables.checklistId] });
            queryClient.invalidateQueries({ queryKey: ['checklists', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['kanban', variables.restaurantId] });
        },
    });
};

export const useResumeTask = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ restaurantId, checklistId, taskId, executionId }: {
            restaurantId: string;
            checklistId: string;
            taskId: string;
            executionId: string;
        }) => {
            // Deletar a execução bloqueada (mesmo padrão do toggle ao desmarcar)
            const supabase = createClient();

            // Buscar ID real se for otimista
            let realId = executionId;
            if (realId.startsWith('optimistic-')) {
                const { data: exec } = await supabase
                    .from('task_executions')
                    .select('id')
                    .eq('task_id', taskId)
                    .eq('checklist_id', checklistId)
                    .eq('status', 'blocked')
                    .maybeSingle();
                realId = exec?.id;
            }

            if (realId) {
                const { error } = await supabase
                    .from('task_executions')
                    .delete()
                    .eq('id', realId);
                if (error) throw error;
            }
            return { deleted: true, taskId };
        },
        onMutate: async (variables) => {
            const queryKey = ['activity', variables.restaurantId, variables.checklistId];
            await queryClient.cancelQueries({ queryKey });

            const previousData = queryClient.getQueryData<ActivityData>(queryKey);

            // Optimistic: remover a execução bloqueada
            if (previousData) {
                queryClient.setQueryData<ActivityData>(queryKey, (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        executions: old.executions.filter(e => e.task_id !== variables.taskId),
                    };
                });
            }

            return { previousData, queryKey };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(context.queryKey, context.previousData);
            }
        },
        onSettled: (_data, _error, variables) => {
            queryClient.invalidateQueries({ queryKey: ['activity', variables.restaurantId, variables.checklistId] });
            queryClient.invalidateQueries({ queryKey: ['checklists', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['kanban', variables.restaurantId] });
        },
    });
};
