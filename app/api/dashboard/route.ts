import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilNow, getBrazilStartAndEndOfDay, getBrazilDateKey } from '@/lib/utils/brazil-date';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';
import type { RecurrenceConfig } from '@/lib/types';

// ─── Constantes operacionais ─────────────────────────────────────────────────

/** Minutos de carência antes de uma tarefa crítica não executada virar alerta */
const CRITICAL_GRACE_MINUTES = 10;

/** Cap em minutos para considerar no tempo médio de conclusão (4h) */
const CONCLUSION_TIME_CAP_MINUTES = 240;

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface AssumptionRow {
    id: string;
    checklist_id: string;
    user_id: string;
    user_name: string;
    date_key: string;
    assumed_at: string;
    completed_at: string | null;
    execution_status: string;
    blocked_reason: string | null;
}

interface ChecklistRow {
    id: string;
    name: string;
    shift?: string | null;
    area_id: string | null;
    end_time: string | null;
    start_time: string | null;
    recurrence?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recurrence_config?: any;
    assigned_to_user_id: string | null;
    areas: { id: string; name: string; color: string } | null;
    checklist_tasks: { id: string; is_critical: boolean }[];
}

interface TaskExecRow {
    checklist_id: string;
    task_id: string;
    status: string;
    checklist_assumption_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDistanceToNowPT = (dateMs: number) => {
    const diffInMinutes = Math.floor((new Date().getTime() - dateMs) / 60000);
    if (diffInMinutes < 60) return `Há ${diffInMinutes} minuto${diffInMinutes !== 1 ? 's' : ''}`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Há ${diffInHours} hora${diffInHours !== 1 ? 's' : ''}`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `Há ${diffInDays} dia${diffInDays !== 1 ? 's' : ''}`;
};

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

const isCompleted = (a: { completed_at: string | null; execution_status: string }) =>
    a.completed_at !== null || a.execution_status === 'done';

const getChecklistIcon = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('cozinha')) return 'kitchen';
    if (n.includes('bar')) return 'local_bar';
    if (n.includes('banheiro') || n.includes('limpeza')) return 'cleaning_services';
    if (n.includes('salão') || n.includes('salao')) return 'restaurant';
    if (n.includes('estoque')) return 'inventory';
    if (n.includes('abertura')) return 'door_open';
    if (n.includes('fechamento')) return 'door_front';
    return 'checklist';
};

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        // ── Auth ──────────────────────────────────────────────────────────
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: 'Sem autorização' }, { status: 401 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        // ── Datas (timezone Brasil) ────────────────────────────────────────
        const brazil = getBrazilNow();
        const todayKey = brazil.dateKey;
        const { start: todayStartISO, end: todayEndISO } = getBrazilStartAndEndOfDay();

        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayKey = getBrazilDateKey(yesterdayDate);

        const sevenDaysAgoDate = new Date();
        sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 6);
        const sevenDaysAgoKey = getBrazilDateKey(sevenDaysAgoDate);

        // ── Round 1: Queries paralelas (inclui shifts) ─────────────────────
        const [checklistsRes, assumptionsRes, taskExecsRes, shiftsRes] = await Promise.all([
            // Checklists ativos — apenas metadados (nome, área, tasks, horários)
            adminSupabase
                .from('checklists')
                .select('id, name, shift, area_id, end_time, start_time, recurrence, recurrence_config, assigned_to_user_id, areas(id, name, color), checklist_tasks(id, is_critical)')
                .eq('restaurant_id', restaurant_id)
                .eq('active', true)
                .eq('status', 'active'),

            // Assumptions dos últimos 7 dias — fonte primária de TODAS as métricas
            adminSupabase
                .from('checklist_assumptions')
                .select('id, checklist_id, user_id, user_name, date_key, assumed_at, completed_at, execution_status, blocked_reason')
                .eq('restaurant_id', restaurant_id)
                .gte('date_key', sevenDaysAgoKey)
                .lte('date_key', todayKey),

            // Task executions de hoje — para progresso granular por tarefa e detecção de bloqueios
            adminSupabase
                .from('task_executions')
                .select('checklist_id, task_id, status, checklist_assumption_id')
                .eq('restaurant_id', restaurant_id)
                .gte('executed_at', todayStartISO)
                .lte('executed_at', todayEndISO),

            // Shifts para resolver recurrence='shift_days'
            adminSupabase
                .from('shifts')
                .select('shift_type, days_of_week')
                .eq('restaurant_id', restaurant_id)
                .eq('active', true),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allChecklists = (checklistsRes.data || []) as any as ChecklistRow[];
        const allAssumptions: AssumptionRow[] = assumptionsRes.data || [];
        const taskExecs: TaskExecRow[] = taskExecsRes.data || [];
        const shifts = shiftsRes.data;

        // Filtrar checklists por regras de recorrência (dia da semana, custom, etc.)
        const checklists = filterChecklistsByRecurrence(allChecklists, brazil.dayOfWeek, brazil.dateKey, shifts || []);

        // Mapa de checklists para lookup rápido (metadados apenas)
        const checklistsMap = new Map<string, ChecklistRow>();
        checklists.forEach(cl => checklistsMap.set(cl.id, cl));

        // Separar assumptions por data
        const todayAssumptions = allAssumptions.filter(a => a.date_key === todayKey);
        const yesterdayAssumptions = allAssumptions.filter(a => a.date_key === yesterdayKey);

        // Sets de tasks concluídas hoje + assumptions com tasks bloqueadas
        const doneTaskIds = new Set<string>();
        const taskDoneByChecklist: Record<string, number> = {};
        const assumptionIdsWithBlockedTasks = new Set<string>();
        taskExecs.forEach(te => {
            if (te.status === 'done' || te.status === 'completed') {
                doneTaskIds.add(te.task_id);
                taskDoneByChecklist[te.checklist_id] = (taskDoneByChecklist[te.checklist_id] || 0) + 1;
            }
            if (te.status === 'blocked' && te.checklist_assumption_id) {
                assumptionIdsWithBlockedTasks.add(te.checklist_assumption_id);
            }
        });

        // ══════════════════════════════════════════════════════════════════
        // TODAS as métricas são baseadas em assumptions (execuções reais)
        // Checklists são usados APENAS como lookup de metadados
        // ══════════════════════════════════════════════════════════════════

        // ── 1. Conclusão Diária (%) ───────────────────────────────────────
        // Denominador: total de checklists esperados para o dia (via recorrência)
        // Numerador: checklists com pelo menos 1 assumption concluída (deduplicado)
        const totalRoutinesToday = checklists.length;
        const completedChecklistIdsToday = new Set(
            todayAssumptions.filter(isCompleted).map(a => a.checklist_id)
        );
        const completedToday = completedChecklistIdsToday.size;

        // Yesterday: filtrar checklists esperados por recorrência de ontem
        const yesterdayBrazil = getBrazilNow(yesterdayDate);
        const checklistsYesterday = filterChecklistsByRecurrence(allChecklists, yesterdayBrazil.dayOfWeek, yesterdayKey, shifts || []);
        const totalRoutinesYesterday = checklistsYesterday.length;
        const completedChecklistIdsYesterday = new Set(
            yesterdayAssumptions.filter(isCompleted).map(a => a.checklist_id)
        );
        const completedYesterday = completedChecklistIdsYesterday.size;

        const conclusao_diaria_percent = totalRoutinesToday > 0
            ? Math.round((completedToday / totalRoutinesToday) * 100)
            : 0;
        const conclusao_percent_yesterday = totalRoutinesYesterday > 0
            ? Math.round((completedYesterday / totalRoutinesYesterday) * 100)
            : 0;

        // ── 2. Alertas Abertos + Tarefas Críticas ────────────────────────
        // Regra: cada assumption_id gera APENAS 1 alerta (hierarquia de severidade)
        // Ordem: blocked > critico_atrasado > critico_pendente > atrasado
        let alertasAbertos = 0;
        const alertasRecentes: Array<{
            id: string;
            title: string;
            time_ago: string;
            notes: string;
            severity: 'critical' | 'warning';
            alert_type: 'critico' | 'atrasado' | 'bloqueado';
            responsavel_nome: string;
        }> = [];

        const tarefasCriticas: Array<{
            id: string;
            tipo: 'bloqueado' | 'critico_atrasado' | 'critico_pendente' | 'atrasado';
            checklist_nome: string;
            checklist_id: string;
            responsavel_nome: string;
            responsavel_id: string;
            tempo_atraso: string;
        }> = [];

        const nowHHMM = brazil.timeHHMM;
        const nowMs = Date.now();

        // Set para garantir que cada assumption gere apenas 1 alerta
        const processedAssumptionIds = new Set<string>();

        todayAssumptions.forEach(a => {
            if (processedAssumptionIds.has(a.id)) return;
            const cl = checklistsMap.get(a.checklist_id);
            if (!cl) return;

            const isOverdue = cl.end_time ? nowHHMM > cl.end_time : false;
            const minutesSinceAssumed = (nowMs - new Date(a.assumed_at).getTime()) / 60000;

            // ── PRIORIDADE 1: BLOQUEADO ──
            if (assumptionIdsWithBlockedTasks.has(a.id) || a.execution_status === 'blocked') {
                processedAssumptionIds.add(a.id);
                alertasAbertos++;
                alertasRecentes.push({
                    id: a.id,
                    title: cl.name,
                    time_ago: formatDistanceToNowPT(new Date(a.assumed_at).getTime()),
                    notes: a.blocked_reason || 'Rotina bloqueada por colaborador',
                    severity: 'critical',
                    alert_type: 'bloqueado',
                    responsavel_nome: a.user_name,
                });
                tarefasCriticas.push({
                    id: a.id,
                    tipo: 'bloqueado',
                    checklist_nome: cl.name,
                    checklist_id: cl.id,
                    responsavel_nome: a.user_name,
                    responsavel_id: a.user_id,
                    tempo_atraso: formatDistanceToNowPT(new Date(a.assumed_at).getTime()),
                });
                return;
            }

            // Pular assumptions já concluídas
            if (isCompleted(a)) return;

            const criticalTasks = (cl.checklist_tasks || []).filter(t => t.is_critical);
            const undoneCriticalTasks = criticalTasks.filter(t => !doneTaskIds.has(t.id));

            // ── PRIORIDADE 2: CRÍTICO + ATRASADO ──
            if (undoneCriticalTasks.length > 0 && isOverdue) {
                processedAssumptionIds.add(a.id);
                alertasAbertos++;
                alertasRecentes.push({
                    id: a.id,
                    title: cl.name,
                    time_ago: 'Atrasado',
                    notes: `Prazo: ${cl.end_time} — ${undoneCriticalTasks.length} tarefa(s) crítica(s) pendente(s)`,
                    severity: 'critical',
                    alert_type: 'critico',
                    responsavel_nome: a.user_name,
                });
                tarefasCriticas.push({
                    id: a.id,
                    tipo: 'critico_atrasado',
                    checklist_nome: cl.name,
                    checklist_id: cl.id,
                    responsavel_nome: a.user_name,
                    responsavel_id: a.user_id,
                    tempo_atraso: `Prazo: ${cl.end_time}`,
                });
                return;
            }

            // ── PRIORIDADE 3: CRÍTICO PENDENTE (com grace period) ──
            if (undoneCriticalTasks.length > 0 && minutesSinceAssumed >= CRITICAL_GRACE_MINUTES) {
                processedAssumptionIds.add(a.id);
                alertasAbertos++;
                alertasRecentes.push({
                    id: a.id,
                    title: cl.name,
                    time_ago: formatDistanceToNowPT(new Date(a.assumed_at).getTime()),
                    notes: `${undoneCriticalTasks.length} tarefa(s) crítica(s) aguardando execução`,
                    severity: 'critical',
                    alert_type: 'critico',
                    responsavel_nome: a.user_name,
                });
                tarefasCriticas.push({
                    id: a.id,
                    tipo: 'critico_pendente',
                    checklist_nome: cl.name,
                    checklist_id: cl.id,
                    responsavel_nome: a.user_name,
                    responsavel_id: a.user_id,
                    tempo_atraso: formatDistanceToNowPT(new Date(a.assumed_at).getTime()),
                });
                return;
            }

            // ── PRIORIDADE 4: ATRASADO SIMPLES ──
            if (isOverdue) {
                processedAssumptionIds.add(a.id);
                alertasAbertos++;
                alertasRecentes.push({
                    id: a.id,
                    title: cl.name,
                    time_ago: 'Atrasado',
                    notes: `Prazo: ${cl.end_time} — rotina não concluída`,
                    severity: 'warning',
                    alert_type: 'atrasado',
                    responsavel_nome: a.user_name,
                });
                tarefasCriticas.push({
                    id: a.id,
                    tipo: 'atrasado',
                    checklist_nome: cl.name,
                    checklist_id: cl.id,
                    responsavel_nome: a.user_name,
                    responsavel_id: a.user_id,
                    tempo_atraso: `Prazo: ${cl.end_time}`,
                });
            }
        });

        // ── Rotinas esperadas hoje, não assumidas e atrasadas ─────────────
        // Visão operacional: alerta dispara mesmo sem alguém ter assumido.
        // Dedup por checklist_id — se já há assumption, o loop acima já cuidou.
        const assumedChecklistIds = new Set(todayAssumptions.map(a => a.checklist_id));
        const unassumedOverdueChecklists = checklists.filter(cl =>
            !assumedChecklistIds.has(cl.id) && !!cl.end_time && nowHHMM > cl.end_time
        );

        // Diff alertas ontem
        let alertasYesterday = 0;
        yesterdayAssumptions.forEach(a => {
            if (isCompleted(a) || a.execution_status === 'blocked') return;
            const cl = checklistsMap.get(a.checklist_id);
            if (!cl) return;
            const hasCritical = (cl.checklist_tasks || []).some(t => t.is_critical);
            if (hasCritical) alertasYesterday++;
        });

        // ── 3. Equipe Ativa ───────────────────────────────────────────────
        // Base: distinct user_id com pelo menos 1 assumption hoje
        const todayUserIds = [...new Set(todayAssumptions.map(a => a.user_id))];
        const yesterdayUserIds = [...new Set(yesterdayAssumptions.map(a => a.user_id))];

        // Round 2: Detalhes dos usuários ativos hoje + atribuídos a rotinas atrasadas não assumidas
        const usersMap: Record<string, { name: string; avatar_url: string | null }> = {};
        const userRolesMap: Record<string, string> = {};

        // Batch único: usuários que assumiram + usuários atribuídos a rotinas não assumidas atrasadas
        const extraAssignedUserIds = unassumedOverdueChecklists
            .map(cl => cl.assigned_to_user_id)
            .filter((id): id is string => !!id);
        const userIdsToFetch = [...new Set([...todayUserIds, ...extraAssignedUserIds])];

        if (userIdsToFetch.length > 0) {
            const [usersRes, userRolesRes] = await Promise.all([
                adminSupabase
                    .from('users')
                    .select('id, name, avatar_url')
                    .in('id', userIdsToFetch),
                // user_roles só é usado por top_performers → basta quem executou hoje
                todayUserIds.length > 0
                    ? adminSupabase
                        .from('user_roles')
                        .select('user_id, roles(name)')
                        .eq('restaurant_id', restaurant_id)
                        .in('user_id', todayUserIds)
                    : Promise.resolve({ data: [] as unknown[] }),
            ]);

            (usersRes.data || []).forEach((u: { id: string; name: string | null; avatar_url: string | null }) => {
                usersMap[u.id] = { name: u.name || 'Colaborador', avatar_url: u.avatar_url };
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (userRolesRes.data || []).forEach((ur: any) => {
                const roleName = Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles?.name;
                if (roleName) userRolesMap[ur.user_id] = roleName;
            });
        }

        const equipe_avatars = todayUserIds.slice(0, 3).map(uid => ({
            id: uid,
            nome: usersMap[uid]?.name || 'Colaborador',
            avatar: usersMap[uid]?.avatar_url || null,
        }));

        // ── Alertas de rotinas atrasadas não assumidas ────────────────────
        // Visão operacional: mostra atraso independente de alguém ter assumido.
        // assigned_to_user_id = null → responsável "Equipe"; caso contrário, nome do usuário.
        unassumedOverdueChecklists.forEach(cl => {
            const responsavelNome = cl.assigned_to_user_id
                ? (usersMap[cl.assigned_to_user_id]?.name || 'Colaborador')
                : 'Equipe';

            alertasAbertos++;
            alertasRecentes.push({
                id: cl.id,
                title: cl.name,
                time_ago: 'Atrasado',
                notes: `Prazo: ${cl.end_time} — rotina não assumida`,
                severity: 'warning',
                alert_type: 'atrasado',
                responsavel_nome: responsavelNome,
            });
            tarefasCriticas.push({
                id: cl.id,
                tipo: 'atrasado',
                checklist_nome: cl.name,
                checklist_id: cl.id,
                responsavel_nome: responsavelNome,
                responsavel_id: cl.assigned_to_user_id || '',
                tempo_atraso: `Prazo: ${cl.end_time}`,
            });
        });

        // Ordenação final: critical antes de warning
        alertasRecentes.sort((a, b) => {
            if (a.severity === 'critical' && b.severity !== 'critical') return -1;
            if (a.severity !== 'critical' && b.severity === 'critical') return 1;
            return 0;
        });

        // ── Equipe Detalhes (com status operacional) ──────────────────────
        // Status: impedimento > atrasado > em_andamento > concluiu
        const equipe_detalhes = todayUserIds.map(uid => {
            const userAssumptions = todayAssumptions.filter(a => a.user_id === uid);
            const hasBlocked = userAssumptions.some(a =>
                a.execution_status === 'blocked' || assumptionIdsWithBlockedTasks.has(a.id)
            );
            const allDone = userAssumptions.every(isCompleted);
            const hasOverdue = !hasBlocked && !allDone && userAssumptions.some(a => {
                const cl = checklistsMap.get(a.checklist_id);
                return !isCompleted(a) && cl?.end_time ? nowHHMM > cl.end_time : false;
            });

            let status: 'em_andamento' | 'atrasado' | 'impedimento' | 'concluiu';
            if (hasBlocked) status = 'impedimento';
            else if (allDone) status = 'concluiu';
            else if (hasOverdue) status = 'atrasado';
            else status = 'em_andamento';

            return {
                user_id: uid,
                nome: usersMap[uid]?.name || 'Colaborador',
                avatar: usersMap[uid]?.avatar_url || null,
                status,
                total_assumptions: userAssumptions.length,
                assumptions_done: userAssumptions.filter(isCompleted).length,
            };
        });

        // ── 4. Tempo Médio de Conclusão ───────────────────────────────────
        // Métrica: completed_at - assumed_at (quanto tempo leva para concluir)
        // Cap de 240 min para excluir outliers; outliers são contados separadamente
        let conclusionSumToday = 0;
        let conclusionCountToday = 0;
        let conclusionOutliersToday = 0;

        todayAssumptions.forEach(a => {
            if (!a.completed_at) return;
            const diffMins = (new Date(a.completed_at).getTime() - new Date(a.assumed_at).getTime()) / 60000;
            if (diffMins < 0) return;
            if (diffMins > CONCLUSION_TIME_CAP_MINUTES) {
                conclusionOutliersToday++;
            } else {
                conclusionSumToday += diffMins;
                conclusionCountToday++;
            }
        });

        let conclusionSumYesterday = 0;
        let conclusionCountYesterday = 0;

        yesterdayAssumptions.forEach(a => {
            if (!a.completed_at) return;
            const diffMins = (new Date(a.completed_at).getTime() - new Date(a.assumed_at).getTime()) / 60000;
            if (diffMins >= 0 && diffMins <= CONCLUSION_TIME_CAP_MINUTES) {
                conclusionSumYesterday += diffMins;
                conclusionCountYesterday++;
            }
        });

        const tempo_conclusao_mins = conclusionCountToday > 0
            ? Math.round(conclusionSumToday / conclusionCountToday)
            : 0;
        const tempo_conclusao_yesterday = conclusionCountYesterday > 0
            ? Math.round(conclusionSumYesterday / conclusionCountYesterday)
            : 0;

        // Manter backward compat (zerado — campo legado)
        const avgRespToday = 0;
        const avgRespYesterday = 0;

        // ── 5. Tendências de Execução (7 dias) ───────────────────────────
        // Base: assumptions por dia — concluídas / total assumptions do dia
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const tendencias = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayInfo = getBrazilNow(d);
            const dateKey = dayInfo.dateKey;

            // Denominador: checklists esperados neste dia (via recorrência)
            const dayChecklists = filterChecklistsByRecurrence(allChecklists, dayInfo.dayOfWeek, dateKey, shifts || []);
            const dayTotal = dayChecklists.length;

            // Numerador: checklists com pelo menos 1 assumption concluída (deduplicado)
            const dayAssumptions = allAssumptions.filter(a => a.date_key === dateKey);
            const dayCompletedIds = new Set(
                dayAssumptions.filter(isCompleted).map(a => a.checklist_id)
            );
            const dayCompleted = dayCompletedIds.size;

            const pct = dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : 0;

            tendencias.push({
                date_label: dayNames[dayInfo.dayOfWeek],
                percent: Math.min(pct, 100),
            });
        }

        // ── 6. Progresso por Área / Rotina ────────────────────────────────
        // Base: apenas rotinas com assumption hoje (execução real)
        // Se tem tasks → tasks concluídas / total tasks
        // Se NÃO tem tasks → 100% se assumption concluída, 0% se não
        const checklist_progresso = todayAssumptions
            .map(a => {
                const cl = checklistsMap.get(a.checklist_id);
                if (!cl) return null;

                const tasks = cl.checklist_tasks || [];
                const totalTasks = tasks.length;
                const doneTasks = taskDoneByChecklist[a.checklist_id] || 0;
                const isDone = isCompleted(a);

                let percent: number;
                if (totalTasks > 0) {
                    percent = Math.round((doneTasks / totalTasks) * 100);
                } else {
                    percent = isDone ? 100 : 0;
                }
                percent = Math.min(percent, 100);

                let status = 'Atenção';
                if (percent >= 100) status = 'Concluído';
                else if (percent >= 60) status = 'Em Andamento';

                const area = cl.areas;

                return {
                    id: cl.id,
                    title: cl.name,
                    icon: getChecklistIcon(cl.name),
                    percent,
                    status,
                    area_name: area?.name || null,
                    area_color: area?.color || null,
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        // ── 6b. Progresso por Área (agregação) ────────────────────────────
        // Agrupa checklists esperados hoje por area_id.
        // Reutiliza completedChecklistIdsToday (mesma fonte do KPI de conclusão).
        // Invariante: sum(total) === totalRoutinesToday; sum(completed) === completedToday
        interface AreaProgressoEntry {
            area_id: string;
            area_name: string;
            area_color: string;
            total: number;
            completed: number;
        }
        const areaMap = new Map<string, AreaProgressoEntry>();

        for (const cl of checklists) {
            // Ignorar checklists sem área válida — não criar bucket "Sem área"
            if (!cl.area_id || !cl.areas) continue;

            let entry = areaMap.get(cl.area_id);
            if (!entry) {
                entry = {
                    area_id: cl.area_id,
                    area_name: cl.areas.name,
                    area_color: cl.areas.color,
                    total: 0,
                    completed: 0,
                };
                areaMap.set(cl.area_id, entry);
            }

            entry.total++;
            if (completedChecklistIdsToday.has(cl.id)) {
                entry.completed++;
            }
        }

        const area_progresso = Array.from(areaMap.values()).map(a => ({
            ...a,
            pending: a.total - a.completed,
            percent: a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0,
        }));

        // ── 7. Top Performers Hoje ────────────────────────────────────────
        // Base: assumptions concluídas (completed_at) hoje por usuário
        const performerCounts: Record<string, number> = {};
        todayAssumptions.filter(isCompleted).forEach(a => {
            performerCounts[a.user_id] = (performerCounts[a.user_id] || 0) + 1;
        });

        const top_performers = Object.entries(performerCounts)
            .map(([uid, count]) => ({
                user_id: uid,
                name: usersMap[uid]?.name || 'Colaborador',
                role: userRolesMap[uid] || 'Staff',
                avatar: usersMap[uid]?.avatar_url || null,
                total_done: count,
                percent_on_time: 100,
            }))
            .sort((a, b) => b.total_done - a.total_done)
            .slice(0, 3);

        // ── Resposta ──────────────────────────────────────────────────────
        return NextResponse.json({
            conclusao_diaria_percent,
            conclusao_diaria_diff: conclusao_diaria_percent - conclusao_percent_yesterday,
            alertas_abertos: alertasAbertos,
            alertas_abertos_diff: alertasAbertos - alertasYesterday,
            equipe_ativa: todayUserIds.length,
            equipe_ativa_diff: todayUserIds.length - yesterdayUserIds.length,
            equipe_avatars,
            equipe_detalhes,
            // Legado (zerado) — mantido para não quebrar clientes antigos
            tempo_resposta_mins: avgRespToday,
            tempo_resposta_diff_mins: avgRespToday - avgRespYesterday,
            // Novo: tempo médio de conclusão (assumed_at → completed_at)
            tempo_conclusao_mins,
            tempo_conclusao_diff_mins: tempo_conclusao_mins - tempo_conclusao_yesterday,
            tempo_conclusao_outliers: conclusionOutliersToday,
            tendencias,
            checklist_progresso,
            area_progresso,
            alertas_recentes: alertasRecentes.slice(0, 10),
            tarefas_criticas: tarefasCriticas,
            top_performers,
        });

    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
