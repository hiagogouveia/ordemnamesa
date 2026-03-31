import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface DashboardMetrics {
    conclusao_diaria_percent: number;
    conclusao_diaria_diff: number;
    alertas_abertos: number;
    alertas_abertos_diff: number;
    equipe_ativa: number;
    equipe_ativa_diff: number;
    equipe_avatars: { id: string; nome: string; avatar: string | null }[];
    tempo_resposta_mins: number;
    tempo_resposta_diff_mins: number;

    tendencias: { date_label: string; percent: number }[];
    checklist_progresso: { id: string; title: string; icon: string; percent: number; status: string; area_name?: string | null; area_color?: string | null }[];
    alertas_recentes: { id: string; title: string; time_ago: string; notes: string; severity: 'critical' | 'warning'; alert_type?: 'critico' | 'atrasado' | 'bloqueado' }[];
    top_performers: { user_id: string; name: string; role: string; avatar: string | null; total_done: number; percent_on_time: number }[];
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
                conclusao_diaria_diff: 0,
                alertas_abertos: 0,
                alertas_abertos_diff: 0,
                equipe_ativa: 0,
                equipe_ativa_diff: 0,
                equipe_avatars: [],
                tempo_resposta_mins: 0,
                tempo_resposta_diff_mins: 0,
                tendencias: [],
                checklist_progresso: [],
                alertas_recentes: [],
                top_performers: [],
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
        staleTime: 5 * 60 * 1000,    // considera fresco por 5 min
        refetchOnWindowFocus: true,   // refresca ao voltar para a aba
    });
};
