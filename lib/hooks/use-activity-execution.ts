import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { KanbanTask, KanbanExecution, KanbanChecklist } from './use-tasks';

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
                            // Ensure no duplicates
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
        mutationFn: async ({ restaurantId, checklistId, taskId, executionId, isDone }: { 
            restaurantId: string; 
            checklistId: string; 
            taskId: string; 
            executionId?: string; 
            isDone: boolean; 
        }) => {
            const supabase = createClient();
            
            if (isDone) {
                if (executionId) {
                    const { data, error } = await supabase
                        .from('task_executions')
                        .update({ status: 'done', executed_at: new Date().toISOString() })
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
                            executed_at: new Date().toISOString()
                        })
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            } else {
                // To uncheck, we set status to 'todo' instead of DELETING to avoid RLS issues.
                if (executionId) {
                    const { data, error } = await supabase
                        .from('task_executions')
                        .update({ status: 'todo', executed_at: new Date().toISOString() })
                        .eq('id', executionId)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
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
                            newExecs = newExecs.map(e => e.id === variables.executionId ? { ...e, status: 'done' } : e);
                        } else {
                            // Fake execution ID for optimistic UI
                            newExecs.push({
                                id: `optimistic-${Date.now()}`,
                                task_id: variables.taskId,
                                status: 'done',
                                executed_at: new Date().toISOString()
                            } as KanbanExecution);
                        }
                    } else {
                        if (variables.executionId) {
                            newExecs = newExecs.map(e => e.id === variables.executionId ? { ...e, status: 'todo' } : e);
                        } else {
                            // If there's an optimistic one, filter by task_id
                            newExecs = newExecs.map(e => e.task_id === variables.taskId ? { ...e, status: 'todo' } : e);
                        }
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
