import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface DashboardMetrics {
    conclusao_diaria_percent: number;
    alertas_abertos: number;
    equipe_ativa: number;
    progresso_geral: number;
    total_tasks: number;
    done_tasks: number;
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useDashboard = (restaurantId: string | null) => {
    return useQuery<DashboardMetrics>({
        queryKey: ['dashboard', 'metrics', restaurantId],
        queryFn: async () => {
            if (!restaurantId) return {
                conclusao_diaria_percent: 0,
                alertas_abertos: 0,
                equipe_ativa: 0,
                progresso_geral: 0,
                total_tasks: 0,
                done_tasks: 0
            };

            const token = await getAuthToken();

            const response = await fetch(`/api/dashboard?restaurant_id=${restaurantId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Falha ao buscar dados do dashboard');
            }

            return response.json();
        },
        enabled: !!restaurantId,
        refetchInterval: 30000, // 30 segundos
    });
};
