import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Scope } from '@/lib/types/scope';

export type { Scope };

export type TarefaCriticaTipo = 'bloqueado' | 'critico_atrasado' | 'critico_pendente' | 'atrasado';
export type EquipeMembroStatus = 'em_andamento' | 'atrasado' | 'impedimento' | 'concluiu';

export interface UnitInfo {
    id: string;
    name: string;
}

export interface TarefaCritica {
    id: string;
    tipo: TarefaCriticaTipo;
    checklist_nome: string;
    checklist_id: string;
    responsavel_nome: string;
    responsavel_id: string;
    tempo_atraso: string;
    unit?: UnitInfo;
}

export interface AreaProgresso {
    area_id: string;
    area_name: string;
    area_color: string;
    total: number;
    completed: number;
    pending: number;
    percent: number;
    unit?: UnitInfo;
}

export interface EquipeDetalhe {
    user_id: string;
    nome: string;
    avatar: string | null;
    status: EquipeMembroStatus;
    total_assumptions: number;
    assumptions_done: number;
    unit?: UnitInfo;
}

export interface UnitBreakdown {
    unit: UnitInfo;
    conclusao_diaria_percent: number;
    alertas_abertos: number;
    equipe_ativa: number;
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
    checklist_progresso: { id: string; title: string; icon: string; percent: number; status: string; area_name?: string | null; area_color?: string | null; unit?: UnitInfo }[];
    area_progresso: AreaProgresso[];
    alertas_recentes: { id: string; title: string; time_ago: string; notes: string; severity: 'critical' | 'warning'; alert_type?: 'critico' | 'atrasado' | 'bloqueado'; responsavel_nome?: string; unit?: UnitInfo }[];
    tarefas_criticas: TarefaCritica[];
    top_performers: { user_id: string; name: string; role: string; avatar: string | null; total_done: number; percent_on_time: number; unit?: UnitInfo }[];

    /** Breakdown por unidade — presente apenas em modo global */
    units_breakdown?: UnitBreakdown[];
}

const EMPTY_METRICS: DashboardMetrics = {
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

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
};

export const useDashboard = (scope: Scope | null) => {
    const isGlobal = scope?.mode === 'global';
    const enabled = scope !== null;

    return useQuery<DashboardMetrics>({
        queryKey: isGlobal
            ? ['dashboard', 'metrics', 'global', scope.accountId]
            : ['dashboard', 'metrics', scope?.mode === 'single' ? scope.restaurantId : null],
        queryFn: async () => {
            if (!scope) return EMPTY_METRICS;

            const token = await getAuthToken();
            const url = isGlobal
                ? `/api/dashboard?account_id=${scope.accountId}&mode=global`
                : `/api/dashboard?restaurant_id=${scope.restaurantId}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Falha ao buscar dados do dashboard');
            }

            return response.json();
        },
        enabled,
        staleTime: 2 * 60 * 1000,
    });
};
