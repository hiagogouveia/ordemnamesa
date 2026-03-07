import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface EquipeMember {
    id: string;      // ID do vinculo restaurant_users
    user_id: string; // auth.users.id
    name: string;
    email: string;
    avatar: string | null;
    role: 'staff' | 'manager' | 'owner';
    active: boolean;
    performance: number | null;
}

export interface EquipeData {
    metrics: {
        total_colaboradores: number;
        turnos_ativos: number;
        media_desempenho: number;
    };
    equipe: EquipeMember[];
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useEquipe = (restaurantId: string | null) => {
    return useQuery<EquipeData>({
        queryKey: ['equipe', restaurantId],
        queryFn: async () => {
            if (!restaurantId) return {
                metrics: { total_colaboradores: 0, turnos_ativos: 0, media_desempenho: 0 },
                equipe: []
            };

            const token = await getAuthToken();

            const response = await fetch(`/api/equipe?restaurant_id=${restaurantId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Falha ao buscar equipe');
            }

            return response.json();
        },
        enabled: !!restaurantId,
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

export const useUpdateEquipeMember = (restaurantId: string | null) => {
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
        }
    });
};
