import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Scope } from '@/lib/types/scope';
import {
    DELETE_MEMBER_ERROR_MESSAGES,
    type DeleteMemberErrorCode,
    type DeleteMemberPreview,
    type DeleteMemberResponse,
} from '@/lib/types/equipe-deletion';

export type { Scope };

export interface EquipeMemberUnit {
    id: string;
    name: string;
    role: 'staff' | 'manager' | 'owner';
}

export interface EquipeMember {
    id: string;      // ID do vinculo restaurant_users
    user_id: string; // auth.users.id
    name: string;
    email: string;
    avatar: string | null;
    role: 'staff' | 'manager' | 'owner';
    active: boolean;
    performance: number | null;
    areas: { id: string; name: string; color: string }[];
    units?: EquipeMemberUnit[];
}

export interface EquipeData {
    metrics: {
        total_colaboradores: number;
        turnos_ativos: number;
        media_desempenho: number;
    };
    equipe: EquipeMember[];
}

export interface EquipeScope {
    restaurantId: string | null;
    accountId?: string | null;
    mode?: 'single' | 'global';
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useEquipe = (arg: string | null | EquipeScope) => {
    const scope: EquipeScope = typeof arg === 'object' && arg !== null
        ? arg
        : { restaurantId: arg, mode: 'single' };
    const isGlobal = scope.mode === 'global';
    const enabled = isGlobal ? !!scope.accountId : !!scope.restaurantId;

    return useQuery<EquipeData>({
        queryKey: isGlobal ? ['equipe', 'global', scope.accountId] : ['equipe', scope.restaurantId],
        queryFn: async () => {
            if (!enabled) return {
                metrics: { total_colaboradores: 0, turnos_ativos: 0, media_desempenho: 0 },
                equipe: []
            };

            const token = await getAuthToken();
            const url = isGlobal
                ? `/api/equipe?account_id=${scope.accountId}&mode=global`
                : `/api/equipe?restaurant_id=${scope.restaurantId}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Falha ao buscar equipe');
            }

            return response.json();
        },
        enabled,
        staleTime: 5 * 60 * 1000,
    });
};

export const useUpdateEquipeName = (restaurantId: string | null) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
            const token = await getAuthToken();
            const response = await fetch(`/api/equipe/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, restaurant_id: restaurantId })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao atualizar nome');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipe', restaurantId] });
        }
    });
};

export const useChangeCollaboratorPassword = (restaurantId: string | null) => {
    return useMutation({
        mutationFn: async ({ targetUserId, newPassword }: {
            targetUserId: string;
            newPassword: string;
        }) => {
            const token = await getAuthToken();
            const response = await fetch('/api/equipe/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    target_user_id: targetUserId,
                    new_password: newPassword,
                    restaurant_id: restaurantId,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessages: Record<string, string> = {
                    SESSION_EXPIRED: 'Sua sessão expirou. Faça login novamente.',
                    USER_INACTIVE: 'Não é possível alterar a senha de um usuário inativo.',
                    FORBIDDEN: 'Apenas proprietários podem alterar senhas de colaboradores.',
                    VALIDATION_ERROR: 'Dados inválidos. Verifique a senha informada.',
                    INTERNAL_ERROR: 'Erro interno. Tente novamente.',
                };
                throw new Error(errorMessages[errorData.error] ?? 'Erro ao alterar senha');
            }
            return response.json();
        },
    });
};

export const useUpdateEquipeMember = (restaurantId: string | null, accountId?: string | null) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, active, role }: { id: string; active?: boolean; role?: string }) => {
            const token = await getAuthToken();

            const response = await fetch(`/api/equipe?restaurant_id=${restaurantId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id, active, role })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Erro ao atualizar colaborador');
            }

            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipe', restaurantId] });
            // Mirror em account_users pode ter mudado (role/active) — invalida caches dependentes.
            if (accountId) {
                queryClient.invalidateQueries({ queryKey: ['account-access', accountId] });
                queryClient.invalidateQueries({ queryKey: ['units', accountId] });
                queryClient.invalidateQueries({ queryKey: ['billing-status', accountId] });
            }
        }
    });
};

// ─── Exclusão permanente (sprint 95) ─────────────────────────────────────────

const translateDeleteError = (code: unknown, fallback: string) =>
    typeof code === 'string' && code in DELETE_MEMBER_ERROR_MESSAGES
        ? DELETE_MEMBER_ERROR_MESSAGES[code as DeleteMemberErrorCode]
        : fallback;

/**
 * Pré-checagem consultiva: roda a mesma função da exclusão em dry run.
 *
 * Só dispara quando o modal abre (`enabled`) — prefetch por linha da tabela geraria
 * 10 requests para um dado que só importa depois do clique. `staleTime: 0` porque a
 * resposta pode mudar a qualquer momento se o colaborador começar a operar.
 */
export const useMemberDeletionPreview = (
    restaurantId: string | null,
    userId: string | null,
    enabled: boolean
) => {
    return useQuery<DeleteMemberPreview>({
        queryKey: ['equipe-deletion-preview', restaurantId, userId],
        queryFn: async () => {
            const token = await getAuthToken();
            const response = await fetch(
                `/api/equipe/${userId}/deletion-preview?restaurant_id=${restaurantId}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    translateDeleteError(errorData.error, 'Erro ao verificar o colaborador')
                );
            }
            return response.json();
        },
        enabled: enabled && !!restaurantId && !!userId,
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });
};

export const useDeleteEquipeMember = (restaurantId: string | null, accountId?: string | null) => {
    const queryClient = useQueryClient();

    return useMutation<DeleteMemberResponse, Error, { userId: string }>({
        mutationFn: async ({ userId }) => {
            const token = await getAuthToken();
            const response = await fetch(
                `/api/equipe/${userId}?restaurant_id=${restaurantId}`,
                { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    translateDeleteError(errorData.error, 'Erro ao excluir colaborador')
                );
            }
            return response.json();
        },
        onSuccess: (_data, { userId }) => {
            // Remoção otimista: a linha some antes do refetch. total_colaboradores conta
            // TODOS os vínculos (ativos e inativos), então decrementar exatamente 1 é correto.
            // turnos_ativos e media_desempenho não são recalculados aqui — o invalidate corrige.
            queryClient.setQueryData(
                ['equipe', restaurantId],
                (old: EquipeData | undefined) => {
                    if (!old) return old;
                    if (!old.equipe.some((m) => m.user_id === userId)) return old;
                    return {
                        ...old,
                        equipe: old.equipe.filter((m) => m.user_id !== userId),
                        metrics: {
                            ...old.metrics,
                            total_colaboradores: Math.max(0, old.metrics.total_colaboradores - 1),
                        },
                    };
                }
            );
            queryClient.invalidateQueries({ queryKey: ['equipe'] });
            // A exclusão libera assento do plano e pode ter mexido em account_users.
            if (accountId) {
                queryClient.invalidateQueries({ queryKey: ['account-access', accountId] });
                queryClient.invalidateQueries({ queryKey: ['units', accountId] });
                queryClient.invalidateQueries({ queryKey: ['billing-status', accountId] });
            }
        },
    });
};
