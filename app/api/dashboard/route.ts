import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface ExecUserInfo {
    name?: string | null;
    avatar_url?: string | null;
}

interface AlertaRecente {
    id: string;
    title: string;
    time_ago: string;
    notes: string;
    severity: string;
}

interface StaffAvatar {
    id: string;
    nome: string;
    avatar: string | null;
}
// helper para distance
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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

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

        // Definindo datas (UTC-like)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const endOfYesterday = new Date(yesterday);
        endOfYesterday.setHours(23, 59, 59, 999);

        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Hoje + 6 últimos

        const endStringDay = endOfDay.toISOString();

        const startStringYest = yesterday.toISOString();

        // 1. Checklists Ativos para percentuais
        const { data: checklists } = await adminSupabase
            .from('checklists')
            .select('id, title, tasks:checklist_tasks(id)')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true);

        let totalExpectedTasks = 0;
        const checkListMap = new Map<string, { title: string; count: number; done: number }>();

        if (checklists) {
            checklists.forEach((list: { id: string; title: string; tasks?: { id: string }[] }) => {
                totalExpectedTasks += (list.tasks?.length || 0);
                checkListMap.set(list.id, { title: list.title, count: list.tasks?.length || 0, done: 0 });
            });
        }

        // 2. Execuções Hoje vs Ontem (Para variações e KPIs gerais)
        // Busca um volume que caiba na RAM, assumindo num máximo 2000 por dia (bom pra MVP)
        const { data: execucoes } = await adminSupabase
            .from('task_executions')
            .select('status, checklist_id, executed_at, created_at, execution_notes, checklist_tasks(title, id), executor_id, user:restaurant_users!executor_id(user:users(id, name, email, avatar_url))')
            .eq('restaurant_id', restaurant_id)
            .gte('executed_at', startStringYest)  // Pegar ultimos dois dias de uma vez para separar no JS
            .lte('executed_at', endStringDay);

        let doneToday = 0;
        let flaggedToday = 0;
        let responseTimeSumToday = 0;
        let responseCountToday = 0;

        let doneYest = 0;
        let flaggedYest = 0;
        let responseTimeSumYest = 0;
        let responseCountYest = 0;

        const alertasRecentes: AlertaRecente[] = [];
        const todayPerformers: Record<string, { total_done: number; name: string; avatar: string | null; role: string }> = {};
        const yesterdayExecutors = new Set<string>();

        if (execucoes) {
            execucoes.forEach((exec) => {
                const ts = new Date(exec.executed_at).getTime();
                const isToday = ts >= today.getTime();

                // Diff em minutos
                const createdTs = new Date(exec.created_at).getTime();
                const diffMins = (ts - createdTs) / (1000 * 60);

                if (isToday) {
                    if (exec.status === 'done' || exec.status === 'completed') {
                        doneToday++;
                        responseTimeSumToday += diffMins;
                        responseCountToday++;

                        // Checklists grouping
                        if (exec.checklist_id && checkListMap.has(exec.checklist_id)) {
                            checkListMap.get(exec.checklist_id)!.done++;
                        }

                        // Performers
                        if (exec.executor_id && exec.user) {
                            const nameInfo = ((Array.isArray(exec.user) ? exec.user[0] : exec.user) as unknown as { user?: ExecUserInfo })?.user;
                            if (!todayPerformers[exec.executor_id]) {
                                todayPerformers[exec.executor_id] = {
                                    total_done: 0,
                                    name: (nameInfo?.name || 'Colaborador'),
                                    avatar: nameInfo?.avatar_url || null,
                                    role: 'Staff'
                                };
                            }
                            todayPerformers[exec.executor_id].total_done++;
                        }
                    }
                    if (exec.status === 'flagged') {
                        flaggedToday++;
                        alertasRecentes.push({
                            id: (exec.checklist_tasks as unknown as { id?: string })?.id || String(Math.random()),
                            title: (exec.checklist_tasks as unknown as { title?: string })?.title || 'Relatório de Incidente',
                            time_ago: formatDistanceToNowPT(ts),
                            notes: exec.execution_notes || 'Requer revisão imediata.',
                            severity: 'critical' // Poderiamos avaliar dinâmico
                        });
                    }
                } else {
                    // Yest
                    if (exec.status === 'done' || exec.status === 'completed') {
                        doneYest++;
                        responseTimeSumYest += diffMins;
                        responseCountYest++;
                        if (exec.executor_id) {
                            yesterdayExecutors.add(exec.executor_id);
                        }
                    }
                    if (exec.status === 'flagged') {
                        flaggedYest++;
                    }
                }
            });
        }

        const calcPercentToday = totalExpectedTasks > 0 ? Math.round((doneToday / totalExpectedTasks) * 100) : 0;
        const calcPercentYest = totalExpectedTasks > 0 ? Math.round((doneYest / totalExpectedTasks) * 100) : 0;
        const avgRespToday = responseCountToday > 0 ? Math.round(responseTimeSumToday / responseCountToday) : 0;
        const avgRespYest = responseCountYest > 0 ? Math.round(responseTimeSumYest / responseCountYest) : 0;

        // 3. Equipe — derivado de task_executions reais (quem executou tarefa hoje)
        const staffActiveToday = Object.keys(todayPerformers).length;
        const staffAvatars: StaffAvatar[] = Object.entries(todayPerformers)
            .slice(0, 3)
            .map(([uid, dt]) => ({
                id: uid,
                nome: dt.name,
                avatar: dt.avatar
            }));

        // 4. Progresso por Area format
        const checklistProgresso = Array.from(checkListMap.values()).map((c) => {
            const pct = c.count > 0 ? Math.round((c.done / c.count) * 100) : 0;
            let status = 'Atenção';
            if (pct >= 100) status = 'Concluído';
            else if (pct >= 60) status = 'Em Andamento';

            // Mapping genéricos de icones pelo nome (simples match pra MVP visual idêntico ao designer)
            let icon = 'checklist';
            if (c.title.toLowerCase().includes('cozinha')) icon = 'kitchen';
            if (c.title.toLowerCase().includes('bar')) icon = 'local_bar';
            if (c.title.toLowerCase().includes('banheiro')) icon = 'cleaning_services';

            return {
                id: c.title,
                title: c.title,
                icon,
                percent: Math.min(pct, 100),
                status
            };
        });

        // 5. Tendências de 7 dias (Soma de count para cada dia gte sevenDaysAgo)
        // Para os últimos 7 dias, vamos buscar direto via aggregate sum se for possivel, mas como supabase count = ok
        const tendencesArr = [];
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        const { data: weekExecs } = await adminSupabase
            .from('task_executions')
            .select('executed_at, status')
            .eq('restaurant_id', restaurant_id)
            .in('status', ['done', 'completed'])
            .gte('executed_at', sevenDaysAgo.toISOString())
            .lte('executed_at', endStringDay);

        // Agrupar por dia da semana
        const weekMap: Record<string, number> = {};
        if (weekExecs) {
            weekExecs.forEach(e => {
                const bdMonthDay = new Date(e.executed_at).toLocaleDateString('pt-BR');
                weekMap[bdMonthDay] = (weekMap[bdMonthDay] || 0) + 1;
            });
        }

        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const keyStr = d.toLocaleDateString('pt-BR');
            const doneThatDay = weekMap[keyStr] || 0;
            const pctThatDay = totalExpectedTasks > 0 ? Math.round((doneThatDay / totalExpectedTasks) * 100) : 0;

            tendencesArr.push({
                date_label: dayNames[d.getDay()],
                percent: Math.min(pctThatDay, 100)
            });
        }

        // 6. Top Performers (Top 3 Object.values sorted)
        const top_performers = Object.entries(todayPerformers)
            .map(([uid, dt]) => ({
                user_id: uid,
                name: dt.name,
                role: dt.role,
                avatar: dt.avatar,
                total_done: dt.total_done,
                percent_on_time: 100 // Hardcoded for now as exact on-time needs schedule logic
            }))
            .sort((a, b) => b.total_done - a.total_done)
            .slice(0, 3);

        const responseData = {
            conclusao_diaria_percent: calcPercentToday,
            conclusao_diaria_diff: calcPercentToday - calcPercentYest,
            alertas_abertos: flaggedToday,
            alertas_abertos_diff: flaggedToday - flaggedYest,
            equipe_ativa: staffActiveToday,
            equipe_ativa_diff: Object.keys(todayPerformers).length - yesterdayExecutors.size,
            equipe_avatars: staffAvatars,
            tempo_resposta_mins: avgRespToday,
            tempo_resposta_diff_mins: avgRespToday - avgRespYest,
            tendencias: tendencesArr,
            checklist_progresso: checklistProgresso,
            alertas_recentes: alertasRecentes,
            top_performers: top_performers,
            // legacy overrides
            progresso_geral: calcPercentToday,
            total_tasks: totalExpectedTasks,
            done_tasks: doneToday
        };

        return NextResponse.json(responseData);

    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
