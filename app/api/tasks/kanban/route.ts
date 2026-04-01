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

        // 1. Obter areas e roles do usuário neste restaurante
        const { data: userAreas } = await adminSupabase
            .from('user_areas')
            .select('area_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);
            
        const { data: userRoles } = await adminSupabase
            .from('user_roles')
            .select('role_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const areaIds = userAreas?.map(ua => ua.area_id) || [];
        const roleIds = userRoles?.map(ur => ur.role_id) || [];

        // 2. Buscar checklists ativos: da área/role do usuário (sem atribuição individual),
        //    atribuídos diretamente, OU globais (assignment_type = 'all')
        // Lógica: (area_id IN user_areas AND assigned_to_user_id IS NULL)
        //      OR (role_id IN user_roles AND assigned_to_user_id IS NULL)
        //      OR (assigned_to_user_id = user.id)
        //      OR (assigned_to_user_id IS NULL AND area_id IS NULL AND role_id IS NULL)
        const checklistFilterParts: string[] = [];
        if (areaIds.length > 0) {
            checklistFilterParts.push(`and(area_id.in.(${areaIds.join(',')}),assigned_to_user_id.is.null)`);
        }
        if (roleIds.length > 0) {
            checklistFilterParts.push(`and(role_id.in.(${roleIds.join(',')}),assigned_to_user_id.is.null)`);
        }
        checklistFilterParts.push(`assigned_to_user_id.eq.${user.id}`);
        // Checklists globais: sem área, sem role, sem atribuição individual
        checklistFilterParts.push(`and(assigned_to_user_id.is.null,area_id.is.null,role_id.is.null)`);

        const { data: activeChecklists } = await adminSupabase
            .from('checklists')
            .select('id, name, description, is_required, recurrence, last_reset_at, assigned_to_user_id, role_id, area_id, roles(id, name, color), areas(id, name, color), checklist_type, start_time, end_time')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .eq('status', 'active')
            .or(checklistFilterParts.join(','));

        const checklistIds = activeChecklists?.map(c => c.id) || [];
        const checklistMeta = new Map(activeChecklists?.map(c => [c.id, { is_required: c.is_required, recurrence: c.recurrence, last_reset_at: c.last_reset_at }]) || []);

        // Reset de recorrência: apagar execuções antigas conforme o ciclo do checklist
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfYear = new Date(today.getFullYear(), 0, 1);

        for (const cl of (activeChecklists || [])) {
            if (!cl.recurrence || cl.recurrence === 'none') continue;

            let periodStart: Date | null = null;
            const lastReset = cl.last_reset_at ? new Date(cl.last_reset_at) : null;

            if (cl.recurrence === 'daily' || cl.recurrence === 'weekdays') {
                periodStart = today;
            } else if (cl.recurrence === 'weekly') {
                periodStart = startOfWeek;
            } else if (cl.recurrence === 'monthly') {
                periodStart = startOfMonth;
            } else if (cl.recurrence === 'yearly') {
                periodStart = startOfYear;
            }

            if (periodStart && (!lastReset || lastReset < periodStart)) {
                await adminSupabase
                    .from('task_executions')
                    .delete()
                    .eq('restaurant_id', restaurant_id)
                    .lt('executed_at', periodStart.toISOString())
                    .in('task_id', (await adminSupabase.from('checklist_tasks').select('id').eq('checklist_id', cl.id)).data?.map(t => t.id) || []);

                await adminSupabase
                    .from('checklists')
                    .update({ last_reset_at: new Date().toISOString() })
                    .eq('id', cl.id);
            }
        }

        let tasksData: Record<string, unknown>[] = [];
        if (checklistIds.length > 0) {
            const tasksQuery = adminSupabase
                .from('checklist_tasks')
                .select('*')
                .eq('restaurant_id', restaurant_id)
                .in('checklist_id', checklistIds)
                .or(`assigned_to_user_id.is.null,assigned_to_user_id.eq.${user.id}`)
                .order('order', { ascending: true });

            const { data: tasks } = await tasksQuery;

            // Checklists atribuídos diretamente ao usuário — todas as tasks são visíveis
            const directlyAssignedChecklistIds = new Set(
                (activeChecklists || [])
                    .filter((c: { assigned_to_user_id?: string }) => c.assigned_to_user_id === user.id)
                    .map((c: { id: string }) => c.id)
            );
            const allUserEffectiveIds = [...areaIds, ...roleIds];

            // Filtro manual das areas/roles (tasks de checklists diretos sempre passam)
            tasksData = (tasks || []).filter((task: Record<string, unknown>) => {
                if (directlyAssignedChecklistIds.has(task.checklist_id as string)) return true;
                if (!task.role_id && !task.area_id) return true;
                if (task.area_id && allUserEffectiveIds.includes(task.area_id as string)) return true;
                if (task.role_id && allUserEffectiveIds.includes(task.role_id as string)) return true;
                return false;
            });
        }

        // Enriquecer tasks com is_required do checklist pai
        tasksData = tasksData.map(task => ({
            ...task,
            is_required: checklistMeta.get(task.checklist_id as string)?.is_required ?? false,
        }));

        // 3. Buscar execuções de HOJE para ESTE USUÁRIO neste restaurante
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const { data: executions } = await adminSupabase
            .from('task_executions')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .gte('executed_at', startOfDay.toISOString())
            .lte('executed_at', endOfDay.toISOString());

        // 4. Buscar assumptions de HOJE para este restaurante
        const todayKey = new Date().toISOString().split('T')[0];
        const { data: assumptions } = await adminSupabase
            .from('checklist_assumptions')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .eq('date_key', todayKey);

        return NextResponse.json({
            checklists: activeChecklists || [],
            tasks: tasksData || [],
            executions: executions || [],
            assumptions: assumptions || [],
        });

    } catch (error: unknown) {
        console.error('[GET /api/tasks/kanban] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
