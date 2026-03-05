import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface RelatoriosData {
    metrics: {
        taxa_conclusao: number;
        taxa_conclusao_diff: number;
        tarefas_pendentes: number;
        colaboradores_ativos: number;
        avaliacao: string;
        total_registros: number;
    };
    consistencia_semanal: { date_label: string; percent: number }[];
    top_performers: { user_id: string; name: string; avatar: string | null; total_done: number; percent: number }[];
    registros_recentes: {
        id: string;
        task_name: string;
        status: string;
        executor_name: string;
        executor_avatar: string | null;
        executed_at: string;
    }[];
}

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useRelatorios = (restaurantId: string | null, startDate: string, endDate: string) => {
    return useQuery<RelatoriosData>({
        queryKey: ['relatorios', restaurantId, startDate, endDate],
        queryFn: async () => {
            if (!restaurantId) return {
                metrics: { taxa_conclusao: 0, taxa_conclusao_diff: 0, tarefas_pendentes: 0, colaboradores_ativos: 0, avaliacao: '0.0', total_registros: 0 },
                consistencia_semanal: [],
                top_performers: [],
                registros_recentes: []
            };

            const token = await getAuthToken();

            const url = new URL(`/api/relatorios`, window.location.origin);
            url.searchParams.append('restaurant_id', restaurantId);
            if (startDate) url.searchParams.append('start_date', startDate);
            if (endDate) url.searchParams.append('end_date', endDate);

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Falha ao buscar relatórios');
            }

            return response.json();
        },
        enabled: !!restaurantId,
    });
};
