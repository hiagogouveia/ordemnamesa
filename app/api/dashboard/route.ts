import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

        // Validação de Role do Requestor
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

        // Determinar "Hoje" em UTC ou Timezone. Sendo prático, vamos usar UTC day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const startString = today.toISOString();
        const endString = endOfDay.toISOString();

        // 1. Total Checklist Tasks Ativas (Para o turno, precisamos saber quantas tasks existem)
        const { data: checklists } = await adminSupabase
            .from('checklists')
            .select('id, tasks:checklist_tasks(id)')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true);

        let totalExpectedTasks = 0;
        if (checklists) {
            checklists.forEach((list: { id: string; tasks?: { id: string }[] }) => {
                totalExpectedTasks += (list.tasks?.length || 0);
            });
        }

        // 2. O que foi Concluído Hoje ('done')
        const { count: completedCount } = await adminSupabase
            .from('task_executions')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', restaurant_id)
            .eq('status', 'done')
            .gte('executed_at', startString)
            .lte('executed_at', endString);

        // 3. Alertas Abertos Hoje ('flagged')
        const { count: flaggedCount } = await adminSupabase
            .from('task_executions')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', restaurant_id)
            .eq('status', 'flagged')
            .gte('executed_at', startString)
            .lte('executed_at', endString);

        // 4. Staffs Ativos
        const { count: staffTotal } = await adminSupabase
            .from('restaurant_users')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', restaurant_id)
            .eq('role', 'staff')
            .eq('active', true);

        // A porcentagem de conclusão
        const doneTotal = completedCount || 0;
        const calcPercent = totalExpectedTasks > 0 ? Math.round((doneTotal / totalExpectedTasks) * 100) : 0;

        return NextResponse.json({
            conclusao_diaria_percent: calcPercent,
            alertas_abertos: flaggedCount || 0,
            equipe_ativa: staffTotal || 0,
            progresso_geral: calcPercent, // Mesmo calculo conforme bug 2 spec
            total_tasks: totalExpectedTasks,
            done_tasks: doneTotal
        });

    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
