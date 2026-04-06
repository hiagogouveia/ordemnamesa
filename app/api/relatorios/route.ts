import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RegistroRecente {
    id: string;
    task_name: string;
    status: string;
    executor_name: string;
    executor_avatar: string | null;
    executed_at: string;
}

interface ExecRow {
    id: string;
    status: string;
    executed_at: string;
    checklist_id: string;
    user_id: string;
    photo_url: string | null;
    checklist_tasks: { title?: string } | null;
    user: { user: { id?: string; name?: string; avatar_url?: string | null } | null } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function getUserInfo(ex: ExecRow): { name: string; avatar: string | null } {
    const nested = ex.user as unknown as { user?: { name?: string; avatar_url?: string | null } } | null;
    const userInfo = nested?.user;
    return {
        name: userInfo?.name || 'Colaborador',
        avatar: userInfo?.avatar_url || null,
    };
}

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const start_date = searchParams.get('start_date');
        const end_date = searchParams.get('end_date');
        const format = searchParams.get('format');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        // ── Auth ─────────────────────────────────────────────────────────────
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

        // ── Dates ────────────────────────────────────────────────────────────
        const now = new Date();
        let startD = new Date();
        startD.setDate(startD.getDate() - 30);
        let endD = new Date();

        if (start_date) startD = new Date(start_date);
        if (end_date) endD = new Date(end_date);

        // Normalize to full days
        startD.setHours(0, 0, 0, 0);
        endD.setHours(23, 59, 59, 999);

        const msDiff = endD.getTime() - startD.getTime();
        const daysDiff = Math.max(1, Math.round(msDiff / (1000 * 3600 * 24)));

        // Previous period (same length, immediately before)
        const prevEndD = new Date(startD.getTime() - 1);
        prevEndD.setHours(23, 59, 59, 999);
        const prevStartD = new Date(prevEndD);
        prevStartD.setDate(prevStartD.getDate() - daysDiff + 1);
        prevStartD.setHours(0, 0, 0, 0);

        // Date keys for assumptions
        const startKey = getDateKey(startD);
        const endKey = getDateKey(endD);
        const prevStartKey = getDateKey(prevStartD);
        const prevEndKey = getDateKey(prevEndD);

        // ── Parallel queries ─────────────────────────────────────────────────
        const [checklistsRes, assumptionsRes, prevAssumptionsRes, execucoesRes, prevExecucoesRes] = await Promise.all([
            // Active checklists with task count
            adminSupabase
                .from('checklists')
                .select('id, name, checklist_tasks(id, is_critical)')
                .eq('restaurant_id', restaurant_id)
                .eq('active', true)
                .eq('status', 'active'),

            // Assumptions in current period
            adminSupabase
                .from('checklist_assumptions')
                .select('id, checklist_id, user_id, user_name, date_key, assumed_at, completed_at, execution_status')
                .eq('restaurant_id', restaurant_id)
                .gte('date_key', startKey)
                .lte('date_key', endKey),

            // Assumptions in previous period (for diff calculation)
            adminSupabase
                .from('checklist_assumptions')
                .select('id, checklist_id, user_id, date_key, completed_at, execution_status')
                .eq('restaurant_id', restaurant_id)
                .gte('date_key', prevStartKey)
                .lte('date_key', prevEndKey),

            // Task executions in current period
            adminSupabase
                .from('task_executions')
                .select(`
                    id, status, executed_at, checklist_id, user_id, photo_url,
                    checklist_tasks(title),
                    user:restaurant_users!user_id(user:users(id, name, avatar_url))
                `)
                .eq('restaurant_id', restaurant_id)
                .gte('executed_at', startD.toISOString())
                .lte('executed_at', endD.toISOString())
                .order('executed_at', { ascending: false }),

            // Task executions in previous period (for diff)
            adminSupabase
                .from('task_executions')
                .select('id, status')
                .eq('restaurant_id', restaurant_id)
                .gte('executed_at', prevStartD.toISOString())
                .lte('executed_at', prevEndD.toISOString()),
        ]);

        const checklists = checklistsRes.data || [];
        const assumptions = assumptionsRes.data || [];
        const prevAssumptions = prevAssumptionsRes.data || [];
        const execucoes = (execucoesRes.data || []) as unknown as ExecRow[];
        const prevExecucoes = prevExecucoesRes.data || [];

        // Total tasks per day (expected)
        let totalTasksDaily = 0;
        let totalCriticalTasks = 0;
        checklists.forEach((cl: { checklist_tasks?: { id: string; is_critical: boolean }[] }) => {
            const tasks = cl.checklist_tasks || [];
            totalTasksDaily += tasks.length;
            totalCriticalTasks += tasks.filter(t => t.is_critical).length;
        });

        const totalChecklists = checklists.length;
        const expectedTotalRange = totalTasksDaily * daysDiff;

        // ── 1. Taxa de Conclusão (%) ─────────────────────────────────────────
        // Based on checklist_assumptions completion rate
        const isCompleted = (a: { completed_at?: string | null; execution_status: string }) =>
            a.completed_at !== null || a.execution_status === 'done';

        const completedAssumptions = assumptions.filter(isCompleted).length;
        const expectedAssumptions = totalChecklists * daysDiff;
        const taxaConclusao = expectedAssumptions > 0
            ? Math.min(100, Math.round((completedAssumptions / expectedAssumptions) * 100))
            : 0;

        // Previous period comparison
        const prevCompletedAssumptions = prevAssumptions.filter(a =>
            a.completed_at !== null || a.execution_status === 'done'
        ).length;
        const prevTaxaConclusao = expectedAssumptions > 0
            ? Math.min(100, Math.round((prevCompletedAssumptions / expectedAssumptions) * 100))
            : 0;
        const taxaConclusaoDiff = taxaConclusao - prevTaxaConclusao;

        // ── 2. Tarefas Pendentes / Alertas ───────────────────────────────────
        // Count flagged executions + uncompleted critical tasks today
        let tarefasPendentes = 0;

        // Flagged executions in period
        const flaggedCount = execucoes.filter(e => e.status === 'flagged').length;
        tarefasPendentes += flaggedCount;

        // Uncompleted assumptions that are still in_progress or blocked
        const pendingAssumptions = assumptions.filter(a =>
            a.execution_status === 'in_progress' || a.execution_status === 'blocked'
        ).length;
        tarefasPendentes += pendingAssumptions;

        // ── 3. Colaboradores Ativos ──────────────────────────────────────────
        // Distinct users who executed at least 1 task OR assumed at least 1 checklist
        const activeUserIds = new Set<string>();
        assumptions.forEach(a => activeUserIds.add(a.user_id));
        execucoes.forEach(e => {
            if (e.user_id) activeUserIds.add(e.user_id);
        });
        const colaboradoresAtivos = activeUserIds.size;

        // ── 4. Avaliação Média (proxy: avg completion % per collaborator) ────
        // For each active user, calculate their individual completion rate
        const userCompletionMap: Record<string, { done: number; total: number }> = {};
        execucoes.forEach(e => {
            const uid = e.user_id;
            if (!uid) return;
            if (!userCompletionMap[uid]) userCompletionMap[uid] = { done: 0, total: 0 };
            userCompletionMap[uid].total++;
            if (e.status === 'done' || e.status === 'completed') {
                userCompletionMap[uid].done++;
            }
        });

        let avaliacaoSum = 0;
        let avaliacaoCount = 0;
        Object.values(userCompletionMap).forEach(({ done, total }) => {
            if (total > 0) {
                // Convert completion % to 0-5 scale
                avaliacaoSum += (done / total) * 5;
                avaliacaoCount++;
            }
        });

        const avaliacao = avaliacaoCount > 0
            ? (avaliacaoSum / avaliacaoCount).toFixed(1)
            : '0.0';

        // ── 5. Consistência Semanal (últimos 7 dias reais) ───────────────────
        const consistenciaSemanal: { date_label: string; percent: number }[] = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateKey = getDateKey(d);

            const dayCompleted = assumptions.filter(a =>
                a.date_key === dateKey && isCompleted(a)
            ).length;

            const pct = totalChecklists > 0
                ? Math.min(100, Math.round((dayCompleted / totalChecklists) * 100))
                : 0;

            consistenciaSemanal.push({
                date_label: dayLabels[d.getDay()],
                percent: pct,
            });
        }

        // ── 6. Top Performers ────────────────────────────────────────────────
        const topPerformersMap: Record<string, { name: string; avatar: string | null; total_done: number; total: number }> = {};

        execucoes.forEach(ex => {
            const uid = ex.user_id;
            if (!uid) return;

            const { name, avatar } = getUserInfo(ex);

            if (!topPerformersMap[uid]) {
                topPerformersMap[uid] = { name, avatar, total_done: 0, total: 0 };
            }
            topPerformersMap[uid].total++;
            if (ex.status === 'done' || ex.status === 'completed') {
                topPerformersMap[uid].total_done++;
            }
        });

        const topPerformers = Object.entries(topPerformersMap)
            .map(([uid, dt]) => ({
                user_id: uid,
                name: dt.name,
                avatar: dt.avatar,
                total_done: dt.total_done,
                percent: dt.total > 0 ? Math.round((dt.total_done / dt.total) * 100) : 0,
            }))
            .sort((a, b) => b.total_done - a.total_done)
            .slice(0, 5);

        // ── 7. Registros Recentes ────────────────────────────────────────────
        const registrosRecentes: RegistroRecente[] = [];
        const recentLimit = 50;

        for (let i = 0; i < Math.min(execucoes.length, recentLimit); i++) {
            const ex = execucoes[i];
            const { name, avatar } = getUserInfo(ex);
            const taskInfo = ex.checklist_tasks as unknown as { title?: string } | null;

            registrosRecentes.push({
                id: ex.id,
                task_name: taskInfo?.title || 'Tarefa',
                status: ex.status,
                executor_name: name,
                executor_avatar: avatar,
                executed_at: ex.executed_at,
            });
        }

        // ── CSV Export ───────────────────────────────────────────────────────
        if (format === 'csv') {
            const csvHeader = 'Rotina,Tarefa,Responsável,Status,Data/Hora';
            const csvRows: string[] = [];

            // Build checklist name map
            const checklistNameMap: Record<string, string> = {};
            checklists.forEach((cl: { id: string; name: string }) => {
                checklistNameMap[cl.id] = cl.name;
            });

            for (const ex of execucoes) {
                const { name } = getUserInfo(ex);
                const taskInfo = ex.checklist_tasks as unknown as { title?: string } | null;
                const checklistName = checklistNameMap[ex.checklist_id] || 'Rotina';
                const taskName = taskInfo?.title || 'Tarefa';

                const statusLabel =
                    ex.status === 'done' || ex.status === 'completed' ? 'Concluído' :
                    ex.status === 'flagged' ? 'Incidente' :
                    ex.status === 'skipped' ? 'Pulada' :
                    ex.status === 'doing' ? 'Em andamento' :
                    ex.status;

                const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                }).format(new Date(ex.executed_at));

                // Escape CSV fields
                const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

                csvRows.push([
                    escapeCsv(checklistName),
                    escapeCsv(taskName),
                    escapeCsv(name),
                    escapeCsv(statusLabel),
                    escapeCsv(dateFormatted),
                ].join(','));
            }

            const csvContent = [csvHeader, ...csvRows].join('\n');
            const bom = '\uFEFF'; // BOM for Excel UTF-8

            return new NextResponse(bom + csvContent, {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="relatorio_${startKey}_${endKey}.csv"`,
                },
            });
        }

        // ── Response ─────────────────────────────────────────────────────────
        return NextResponse.json({
            metrics: {
                taxa_conclusao: taxaConclusao,
                taxa_conclusao_diff: taxaConclusaoDiff,
                tarefas_pendentes: tarefasPendentes,
                colaboradores_ativos: colaboradoresAtivos,
                avaliacao,
                total_registros: execucoes.length,
            },
            consistencia_semanal: consistenciaSemanal,
            top_performers: topPerformers,
            registros_recentes: registrosRecentes,
        });

    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
