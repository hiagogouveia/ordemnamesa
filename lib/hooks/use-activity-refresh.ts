import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface ActivityRefreshResult {
    isRefreshing: boolean;
    /** Revalida o cache da tela de execução. Retorna true em caso de sucesso. */
    refresh: () => Promise<boolean>;
}

/**
 * Orquestra a atualização manual dos dados da tela de execução de checklist.
 * Invalida as queries da tela (activity, assumption, task-issues) usando React Query.
 *
 * Idiomático para App Router 100% client-side: a fonte de verdade é o cache do
 * React Query, então `invalidateQueries` (refetchType 'active' por padrão) refaz
 * apenas as queries montadas — sem requisições duplicadas/órfãs.
 */
export const useActivityRefresh = (
    restaurantId: string | undefined,
    checklistId: string | undefined,
): ActivityRefreshResult => {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const refresh = useCallback(async (): Promise<boolean> => {
        if (!restaurantId || !checklistId) return false;
        setIsRefreshing(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['activity', restaurantId, checklistId] }),
                queryClient.invalidateQueries({ queryKey: ['assumption', restaurantId, checklistId] }),
                queryClient.invalidateQueries({ queryKey: ['task-issues', restaurantId] }),
            ]);
            return true;
        } catch (e) {
            console.error('Erro ao atualizar atividade:', e);
            return false;
        } finally {
            setIsRefreshing(false);
        }
    }, [queryClient, restaurantId, checklistId]);

    return { isRefreshing, refresh };
};
