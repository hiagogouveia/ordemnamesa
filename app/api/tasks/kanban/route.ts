import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilNow, getBrazilStartAndEndOfDay } from '@/lib/utils/brazil-date';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';

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

        // 2. Buscar checklists ativos visíveis para este usuário:
        //    - Da área do usuário (sem atribuição individual)
        //    - Do role do usuário E com area_id nas áreas do usuário (sem atribuição individual)
        //    - Atribuídos diretamente ao usuário (com area_id válida)
        //    INVARIANTE: checklists sem area_id NÃO aparecem no turno (não são executáveis)
        const checklistFilterParts: string[] = [];
        if (areaIds.length > 0) {
            checklistFilterParts.push(`and(area_id.in.(${areaIds.join(',')}),assigned_to_user_id.is.null)`);
        }
        if (roleIds.length > 0 && areaIds.length > 0) {
            checklistFilterParts.push(`and(role_id.in.(${roleIds.join(',')}),assigned_to_user_id.is.null,area_id.in.(${areaIds.join(',')}))`);
        }
        if (areaIds.length > 0) {
            checklistFilterParts.push(`and(assigned_to_user_id.eq.${user.id},area_id.in.(${areaIds.join(',')}))`);
        }

        // Sem áreas atribuídas = sem checklists visíveis no turno
        if (checklistFilterParts.length === 0) {
            return NextResponse.json({
                checklists: [],
                tasks: [],
                executions: [],
                assumptions: [],
            });
        }

        const { data: activeChecklists } = await adminSupabase
            .from('checklists')
            .select('id, name, description, shift, is_required, recurrence, recurrence_config, last_reset_at, assigned_to_user_id, role_id, area_id, order_index, roles(id, name, color), areas(id, name, color), checklist_type, start_time, end_time')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .eq('status', 'active')
            .or(checklistFilterParts.join(','))
            .order('order_index', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true });

        // Timezone Brasil para todas as operações de data
        const brazil = getBrazilNow();
        const { start: brazilDayStart, end: brazilDayEnd } = getBrazilStartAndEndOfDay();

        // Buscar shifts para resolver recurrence='shift_days'
        const { data: shifts } = await adminSupabase
            .from('shifts')
            .select('shift_type, days_of_week')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true);

        // Filtrar checklists por regras de recorrência (dia da semana, custom, etc.)
        const visibleChecklists = filterChecklistsByRecurrence(
            activeChecklists || [],
            brazil.dayOfWeek,
            brazil.dateKey,
            shifts || [],
        );

        const checklistIds = visibleChecklists.map(c => c.id);
        const checklistMeta = new Map(visibleChecklists.map(c => [c.id, { is_required: c.is_required, recurrence: c.recurrence, last_reset_at: c.last_reset_at }]));

        // Reset de recorrência: apagar execuções antigas conforme o ciclo do checklist
        // (opera sobre TODOS os checklists, não apenas visíveis — reset é manutenção)
        const [yearStr, monthStr, dayStr] = brazil.dateKey.split('-');
        const todayLocal = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
        const startOfWeek = new Date(todayLocal);
        startOfWeek.setDate(todayLocal.getDate() - todayLocal.getDay());
        const startOfMonth = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), 1);
        const startOfYear = new Date(todayLocal.getFullYear(), 0, 1);

        for (const cl of (activeChecklists || [])) {
            if (!cl.recurrence) continue;

            let periodStart: Date | null = null;
            const lastReset = cl.last_reset_at ? new Date(cl.last_reset_at) : null;

            if (cl.recurrence === 'daily' || cl.recurrence === 'weekdays') {
                periodStart = todayLocal;
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
            // Tasks sem area/role herdam visibilidade do checklist pai (já filtrado por área)
            tasksData = (tasks || []).filter((task: Record<string, unknown>) => {
                if (directlyAssignedChecklistIds.has(task.checklist_id as string)) return true;
                if (!task.role_id && !task.area_id) return true;
                if (task.area_id && areaIds.includes(task.area_id as string)) return true;
                if (task.role_id && roleIds.includes(task.role_id as string) && (!task.area_id || areaIds.includes(task.area_id as string))) return true;
                return false;
            });
        }

        // Enriquecer tasks com is_required do checklist pai
        tasksData = tasksData.map(task => ({
            ...task,
            is_required: checklistMeta.get(task.checklist_id as string)?.is_required ?? false,
        }));

        // 3. Buscar execuções de HOJE para ESTE USUÁRIO neste restaurante
        const { data: executions } = await adminSupabase
            .from('task_executions')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .gte('executed_at', brazilDayStart)
            .lte('executed_at', brazilDayEnd);

        // 4. Buscar assumptions de HOJE para este restaurante
        const todayKey = brazil.dateKey;
        const { data: assumptions } = await adminSupabase
            .from('checklist_assumptions')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .eq('date_key', todayKey);

        return NextResponse.json({
            checklists: visibleChecklists,
            tasks: tasksData || [],
            executions: executions || [],
            assumptions: assumptions || [],
        });

    } catch (error: unknown) {
        console.error('[GET /api/tasks/kanban] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
