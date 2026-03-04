import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export type TaskExecutionStatus = 'done' | 'skipped' | 'flagged';

export interface CreateExecutionPayload {
    task_id: string;
    checklist_id: string;
    restaurant_id: string;
    status: TaskExecutionStatus;
    notes?: string;
    photo_url?: string;
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useTurnoAtual = (restaurantId: string | null) => {
    return useQuery({
        queryKey: ['execucoes', 'turnoData', restaurantId],
        queryFn: async () => {
            if (!restaurantId) return null;

            const token = await getAuthToken();
            const dateStr = new Date().toISOString().split('T')[0];

            /* Vamos buscar apenas o progresso do dia (as execuções de hoje). 
               Isso será consolidado com useChecklistActive para bater "Total de Tarefas" com "Qtd de Tarefas de Hoje Feitas".
               No backend (GET /api/execucoes), ele traz apenas as atreladas ao usuário logado na database e as logadas HOJE.
            */
            const response = await fetch(`/api/execucoes?restaurant_id=${restaurantId}&date=${dateStr}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Falha ao buscar as execuções do turno');
            }

            return response.json();
        },
        enabled: !!restaurantId,
    });
};

export const useCreateExecucao = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: CreateExecutionPayload) => {
            const token = await getAuthToken();
            const response = await fetch('/api/execucoes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao registrar a tarefa');
            }

            return response.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['execucoes', 'turnoData', variables.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ['execucoes', 'historico'] });
        },
    });
};

export const useDesfazerExecucao = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, restaurantId }: { id: string; restaurantId: string }) => {
            const token = await getAuthToken();
            const response = await fetch(`/api/execucoes/${id}?restaurant_id=${restaurantId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao estornar a tarefa. Tempo expirado.');
            }

            return response.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['execucoes', 'turnoData', variables.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['execucoes', 'historico'] });
        },
    });
};

export const useHistoricoUsuario = (restaurantId: string | null, userId: string | null) => {
    return useQuery({
        queryKey: ['execucoes', 'historico', restaurantId, userId],
        queryFn: async () => {
            if (!restaurantId || !userId) return null;

            const token = await getAuthToken();

            // Busca os dados da tabela task_executions para este usuário e restaurante
            const response = await fetch(`/api/execucoes/historico?restaurant_id=${restaurantId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Falha ao buscar histórico de execuções');
            }

            return response.json();
        },
        enabled: !!restaurantId && !!userId,
    });
};
