import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilNow, getBrazilStartAndEndOfDay, getBrazilDateKey } from '@/lib/utils/brazil-date';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';
import type { RecurrenceConfig } from '@/lib/types';

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
    areas: { id: string; name: string; color: string } | null;
    checklist_tasks: { id: string; is_critical: boolean }[];
}

interface TaskExecRow {
    checklist_id: string;
    task_id: string;
    status: string;
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

        // ── Round 1: Queries paralelas ────────────────────────────────────
        const [checklistsRes, assumptionsRes, taskExecsRes] = await Promise.all([
            // Checklists ativos — apenas metadados (nome, área, tasks, horários)
            adminSupabase
                .from('checklists')
                .select('id, name, shift, area_id, end_time, start_time, recurrence, recurrence_config, areas(id, name, color), checklist_tasks(id, is_critical)')
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

            // Task executions de hoje — para progresso granular por tarefa
            adminSupabase
                .from('task_executions')
                .select('checklist_id, task_id, status')
                .eq('restaurant_id', restaurant_id)
                .gte('executed_at', todayStartISO)
                .lte('executed_at', todayEndISO),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allChecklists = (checklistsRes.data || []) as any as ChecklistRow[];
        const allAssumptions: AssumptionRow[] = assumptionsRes.data || [];
        const taskExecs: TaskExecRow[] = taskExecsRes.data || [];

        // Buscar shifts para resolver recurrence='shift_days'
        const { data: shifts } = await adminSupabase
            .from('shifts')
            .select('shift_type, days_of_week')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true);

        // Filtrar checklists por regras de recorrência (dia da semana, custom, etc.)
        const checklists = filterChecklistsByRecurrence(allChecklists, brazil.dayOfWeek, brazil.dateKey, shifts || []);

        // Mapa de checklists para lookup rápido (metadados apenas)
        const checklistsMap = new Map<string, ChecklistRow>();
        checklists.forEach(cl => checklistsMap.set(cl.id, cl));

        // Separar assumptions por data
        const todayAssumptions = allAssumptions.filter(a => a.date_key === todayKey);
        const yesterdayAssumptions = allAssumptions.filter(a => a.date_key === yesterdayKey);

        // Sets de tasks concluídas hoje
        const doneTaskIds = new Set<string>();
        const taskDoneByChecklist: Record<string, number> = {};
        taskExecs.forEach(te => {
            if (te.status === 'done' || te.status === 'completed') {
                doneTaskIds.add(te.task_id);
                taskDoneByChecklist[te.checklist_id] = (taskDoneByChecklist[te.checklist_id] || 0) + 1;
            }
        });

        // ══════════════════════════════════════════════════════════════════
        // TODAS as métricas são baseadas em assumptions (execuções reais)
        // Checklists são usados APENAS como lookup de metadados
        // ══════════════════════════════════════════════════════════════════

        // ── 1. Conclusão Diária (%) ───────────────────────────────────────
        // Base: assumptions do dia, NÃO total de checklists
        const totalAssumptionsToday = todayAssumptions.length;
        const completedToday = todayAssumptions.filter(isCompleted).length;

        const totalAssumptionsYesterday = yesterdayAssumptions.length;
        const completedYesterday = yesterdayAssumptions.filter(isCompleted).length;

        const conclusao_diaria_percent = totalAssumptionsToday > 0
            ? Math.round((completedToday / totalAssumptionsToday) * 100)
            : 0;
        const conclusao_percent_yesterday = totalAssumptionsYesterday > 0
            ? Math.round((completedYesterday / totalAssumptionsYesterday) * 100)
            : 0;

        // ── 2. Alertas Abertos ────────────────────────────────────────────
        // Base: assumptions não concluídas hoje, classificadas por tipo
        let alertasAbertos = 0;
        const alertasRecentes: Array<{
            id: string;
            title: string;
            time_ago: string;
            notes: string;
            severity: 'critical' | 'warning';
            alert_type: 'critico' | 'atrasado' | 'bloqueado';
        }> = [];

        const nowHHMM = brazil.timeHHMM;

        todayAssumptions.forEach(a => {
            const cl = checklistsMap.get(a.checklist_id);
            if (!cl) return;

            // ── BLOQUEADO ──
            if (a.execution_status === 'blocked') {
                alertasAbertos++;
                alertasRecentes.push({
                    id: a.id,
                    title: cl.name,
                    time_ago: formatDistanceToNowPT(new Date(a.assumed_at).getTime()),
                    notes: a.blocked_reason || 'Rotina bloqueada por colaborador',
                    severity: 'critical',
                    alert_type: 'bloqueado',
                });
                return; // Bloqueado já é o pior estado, não duplicar
            }

            // Pular assumptions já concluídas — não geram alertas
            if (isCompleted(a)) return;

            const isOverdue = cl.end_time ? nowHHMM > cl.end_time : false;

            // ── CRÍTICO: tasks críticas não concluídas ──
            const criticalTasks = (cl.checklist_tasks || []).filter(t => t.is_critical);
            const undoneCriticalTasks = criticalTasks.filter(t => !doneTaskIds.has(t.id));

            if (undoneCriticalTasks.length > 0) {
                alertasAbertos++;
                alertasRecentes.push({
                    id: a.id,
                    title: cl.name,
                    time_ago: isOverdue ? 'Atrasado' : formatDistanceToNowPT(new Date(a.assumed_at).getTime()),
                    notes: isOverdue
                        ? `Prazo: ${cl.end_time} — ${undoneCriticalTasks.length} tarefa(s) crítica(s) pendente(s)`
                        : `${undoneCriticalTasks.length} tarefa(s) crítica(s) aguardando execução`,
                    severity: 'critical',
                    alert_type: 'critico',
                });
                return; // Crítico tem prioridade sobre atrasado simples
            }

            // ── ATRASADO: end_time ultrapassado sem conclusão ──
            if (isOverdue) {
                alertasAbertos++;
                alertasRecentes.push({
                    id: a.id,
                    title: cl.name,
                    time_ago: 'Atrasado',
                    notes: `Prazo: ${cl.end_time} — rotina não concluída`,
                    severity: 'warning',
                    alert_type: 'atrasado',
                });
            }
        });

        // Diff alertas ontem (simplificado: assumptions não concluídas com tasks críticas)
        let alertasYesterday = 0;
        yesterdayAssumptions.forEach(a => {
            if (isCompleted(a) || a.execution_status === 'blocked') return;
            const cl = checklistsMap.get(a.checklist_id);
            if (!cl) return;
            const hasCritical = (cl.checklist_tasks || []).some(t => t.is_critical);
            if (hasCritical) alertasYesterday++;
        });

        // Ordenar: critical primeiro, depois warning
        alertasRecentes.sort((a, b) => {
            if (a.severity === 'critical' && b.severity !== 'critical') return -1;
            if (a.severity !== 'critical' && b.severity === 'critical') return 1;
            return 0;
        });

        // ── 3. Equipe Ativa ───────────────────────────────────────────────
        // Base: distinct user_id com pelo menos 1 assumption hoje
        const todayUserIds = [...new Set(todayAssumptions.map(a => a.user_id))];
        const yesterdayUserIds = [...new Set(yesterdayAssumptions.map(a => a.user_id))];

        // Round 2: Detalhes dos usuários ativos hoje
        const usersMap: Record<string, { name: string; avatar_url: string | null }> = {};
        const userRolesMap: Record<string, string> = {};

        if (todayUserIds.length > 0) {
            const [usersRes, userRolesRes] = await Promise.all([
                adminSupabase
                    .from('users')
                    .select('id, name, avatar_url')
                    .in('id', todayUserIds),
                adminSupabase
                    .from('user_roles')
                    .select('user_id, roles(name)')
                    .eq('restaurant_id', restaurant_id)
                    .in('user_id', todayUserIds),
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

        // ── 4. Tempo Médio de Resposta ────────────────────────────────────
        // Métrica principal: assumed_at - available_at (start_time do checklist)
        // Fallback: se não há start_time, usa assumed_at - início do dia
        let tempoSomaToday = 0;
        let tempoCountToday = 0;

        todayAssumptions.forEach(a => {
            const cl = checklistsMap.get(a.checklist_id);
            if (!cl) return;

            const assumedAt = new Date(a.assumed_at);
            let availableAt: Date;

            if (cl.start_time) {
                // available_at = hoje + start_time do checklist
                availableAt = new Date(`${todayKey}T${cl.start_time}:00`);
            } else {
                // Fallback: início do dia como momento de disponibilidade
                availableAt = new Date(todayStartISO);
            }

            const diffMins = (assumedAt.getTime() - availableAt.getTime()) / 60000;
            if (diffMins >= 0) {
                tempoSomaToday += diffMins;
                tempoCountToday++;
            }
        });

        let tempoSomaYesterday = 0;
        let tempoCountYesterday = 0;

        yesterdayAssumptions.forEach(a => {
            const cl = checklistsMap.get(a.checklist_id);
            if (!cl) return;

            const assumedAt = new Date(a.assumed_at);
            let availableAt: Date;

            if (cl.start_time) {
                availableAt = new Date(`${yesterdayKey}T${cl.start_time}:00`);
            } else {
                availableAt = new Date(`${yesterdayKey}T00:00:00-03:00`);
            }

            const diffMins = (assumedAt.getTime() - availableAt.getTime()) / 60000;
            if (diffMins >= 0) {
                tempoSomaYesterday += diffMins;
                tempoCountYesterday++;
            }
        });

        const avgRespToday = tempoCountToday > 0 ? Math.round(tempoSomaToday / tempoCountToday) : 0;
        const avgRespYesterday = tempoCountYesterday > 0 ? Math.round(tempoSomaYesterday / tempoCountYesterday) : 0;

        // ── 5. Tendências de Execução (7 dias) ───────────────────────────
        // Base: assumptions por dia — concluídas / total assumptions do dia
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const tendencias = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateKey = getBrazilDateKey(d);
            const dayOfWeek = getBrazilNow(d).dayOfWeek;

            const dayAssumptions = allAssumptions.filter(a => a.date_key === dateKey);
            const dayCompleted = dayAssumptions.filter(isCompleted).length;
            const dayTotal = dayAssumptions.length;

            const pct = dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : 0;

            tendencias.push({
                date_label: dayNames[dayOfWeek],
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
            tempo_resposta_mins: avgRespToday,
            tempo_resposta_diff_mins: avgRespToday - avgRespYesterday,
            tendencias,
            checklist_progresso,
            alertas_recentes: alertasRecentes.slice(0, 10),
            top_performers,
        });

    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
