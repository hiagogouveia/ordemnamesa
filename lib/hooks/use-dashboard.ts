import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export type TarefaCriticaTipo = 'bloqueado' | 'critico_atrasado' | 'critico_pendente' | 'atrasado';
export type EquipeMembroStatus = 'em_andamento' | 'atrasado' | 'impedimento' | 'concluiu';

export interface TarefaCritica {
    id: string;
    tipo: TarefaCriticaTipo;
    checklist_nome: string;
    checklist_id: string;
    responsavel_nome: string;
    responsavel_id: string;
    tempo_atraso: string;
}

export interface AreaProgresso {
    area_id: string;
    area_name: string;
    area_color: string;
    total: number;
    completed: number;
    pending: number;
    percent: number;
}

export interface EquipeDetalhe {
    user_id: string;
    nome: string;
    avatar: string | null;
    status: EquipeMembroStatus;
    total_assumptions: number;
    assumptions_done: number;
}

export interface DashboardMetrics {
    conclusao_diaria_percent: number;
    conclusao_diaria_diff: number;
    alertas_abertos: number;
    alertas_abertos_diff: number;
    equipe_ativa: number;
    equipe_ativa_diff: number;
    equipe_avatars: { id: string; nome: string; avatar: string | null }[];
    equipe_detalhes: EquipeDetalhe[];
    /** @deprecated Usar tempo_conclusao_mins — mantido para compatibilidade */
    tempo_resposta_mins: number;
    /** @deprecated Usar tempo_conclusao_diff_mins — mantido para compatibilidade */
    tempo_resposta_diff_mins: number;
    tempo_conclusao_mins: number;
    tempo_conclusao_diff_mins: number;
    tempo_conclusao_outliers: number;

    tendencias: { date_label: string; percent: number }[];
    checklist_progresso: { id: string; title: string; icon: string; percent: number; status: string; area_name?: string | null; area_color?: string | null }[];
    area_progresso: AreaProgresso[];
    alertas_recentes: { id: string; title: string; time_ago: string; notes: string; severity: 'critical' | 'warning'; alert_type?: 'critico' | 'atrasado' | 'bloqueado'; responsavel_nome?: string }[];
    tarefas_criticas: TarefaCritica[];
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
                equipe_detalhes: [],
                tempo_resposta_mins: 0,
                tempo_resposta_diff_mins: 0,
                tempo_conclusao_mins: 0,
                tempo_conclusao_diff_mins: 0,
                tempo_conclusao_outliers: 0,
                tendencias: [],
                checklist_progresso: [],
                area_progresso: [],
                alertas_recentes: [],
                tarefas_criticas: [],
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
        staleTime: 2 * 60 * 1000,     // dashboard operacional: fresco por 2 min
    });
};
