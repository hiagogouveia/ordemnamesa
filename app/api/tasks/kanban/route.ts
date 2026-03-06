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
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // 1. Obter roles do usuário neste restaurante
        const { data: userRoles } = await adminSupabase
            .from('user_roles')
            .select('role_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const userRoleIds = userRoles?.map(ur => ur.role_id) || [];

        // 2. Buscar todas as tarefas de checklists ATIVOS deste restaurante
        // que tenham role_id IS NULL ou role_id IN (userRoleIds)
        // e que assigned_to_user_id IS NULL ou seja do usuário logado
        const { data: activeChecklists } = await adminSupabase
            .from('checklists')
            .select('id')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true);

        const checklistIds = activeChecklists?.map(c => c.id) || [];

        let tasksData: any[] = [];
        if (checklistIds.length > 0) {
            let tasksQuery = adminSupabase
                .from('checklist_tasks')
                .select('*')
                .eq('restaurant_id', restaurant_id)
                .in('checklist_id', checklistIds)
                .or(`assigned_to_user_id.is.null,assigned_to_user_id.eq.${user.id}`)
                .order('order_index', { ascending: true });

            const { data: tasks } = await tasksQuery;

            // Filtro manual das roles (or com is.null é meio chato no supabase string query as vezes)
            tasksData = (tasks || []).filter(task =>
                !task.role_id || userRoleIds.includes(task.role_id)
            );
        }

        // 3. Buscar execuções de HOJE para ESTE USUÁRIO neste restaurante
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: executions } = await adminSupabase
            .from('task_executions')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .gte('executed_at', startOfDay.toISOString())
            .lte('executed_at', endOfDay.toISOString());

        return NextResponse.json({
            tasks: tasksData || [],
            executions: executions || []
        });

    } catch (error: any) {
        console.error('[GET /api/tasks/kanban] Erro:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
