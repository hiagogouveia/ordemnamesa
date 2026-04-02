import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { MyActivity, MyActivityStatus, TargetRole } from '@/lib/types';
import { getBrazilNow, getBrazilStartAndEndOfDay } from '@/lib/utils/brazil-date';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

function computeActivityStatus(
    endTime: string | null | undefined,
    taskCount: number,
    doneCount: number,
    isFormallyConcluded: boolean,
    nowHHMM: string,
): MyActivityStatus {
    if (isFormallyConcluded) return 'done_today';
    if (taskCount === 0) return 'pending';
    if (doneCount >= taskCount) return 'done_today';
    if (endTime && nowHHMM > endTime && doneCount < taskCount) return 'overdue';
    if (doneCount > 0) return 'in_progress';
    return 'pending';
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        // Verificar membership no restaurante
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Acesso ao restaurante não encontrado.' }, { status: 403 });
        }

        // Buscar as áreas e funções (roles) atribuídas ao usuário
        const { data: userAreaRows } = await adminSupabase
            .from('user_areas')
            .select('area_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const { data: userRoleRows } = await adminSupabase
            .from('user_roles')
            .select('role_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const areaIds = (userAreaRows ?? []).map((r) => r.area_id);
        const roleIds = (userRoleRows ?? []).map((r) => r.role_id);

        // Filtro: checklists da área/role do usuário (sem atribuição individual),
        //         OU atribuídos diretamente ao usuário.
        // INVARIANTE: rotinas sem área (area_id = null) NÃO são executáveis e NÃO aparecem no turno.
        const checklistFilterParts: string[] = [];
        if (areaIds.length > 0) {
            checklistFilterParts.push(`and(area_id.in.(${areaIds.join(',')}),assigned_to_user_id.is.null)`);
        }
        if (roleIds.length > 0) {
            checklistFilterParts.push(`and(role_id.in.(${roleIds.join(',')}),assigned_to_user_id.is.null,area_id.not.is.null)`);
        }
        checklistFilterParts.push(`and(assigned_to_user_id.eq.${user.id},area_id.not.is.null)`);

        // Checklists cuja area_id ou role_id está entre as áreas efetivas do usuário, ou atribuídos diretamente
        const { data: checklists, error: checklistsError } = await adminSupabase
            .from('checklists')
            .select(`
                id,
                restaurant_id,
                name,
                description,
                shift,
                checklist_type,
                is_required,
                start_time,
                end_time,
                target_role,
                area_id,
                role_id,
                order_index,
                recurrence,
                recurrence_config,
                area:areas(id, name, color, priority_mode),
                role:roles(id, name, color),
                task_count:checklist_tasks(count)
            `)
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .eq('status', 'active')
            .or(checklistFilterParts.join(','))
            .order('order_index', { ascending: true, nullsFirst: false });

        if (checklistsError) {
            console.error('[GET /api/my-activities] Erro ao buscar checklists:', checklistsError);
            return NextResponse.json({ error: checklistsError.message }, { status: 500 });
        }

        if (!checklists || checklists.length === 0) {
            return NextResponse.json([]);
        }

        // Timezone Brasil e filtragem de recorrência
        const brazil = getBrazilNow();
        const { start: brazilDayStart } = getBrazilStartAndEndOfDay();

        // Buscar shifts para resolver recurrence='shift_days'
        const { data: shifts } = await adminSupabase
            .from('shifts')
            .select('shift_type, days_of_week')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true);

        const visibleChecklists = filterChecklistsByRecurrence(
            checklists,
            brazil.dayOfWeek,
            brazil.dateKey,
            shifts || [],
        );

        if (visibleChecklists.length === 0) {
            return NextResponse.json([]);
        }

        // Execuções do dia para calcular progresso
        const { data: executions, error: executionsError } = await adminSupabase
            .from('task_executions')
            .select('checklist_id, task_id, status')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .gte('executed_at', brazilDayStart);

        if (executionsError) {
            console.error('[GET /api/my-activities] Erro ao buscar execuções:', executionsError);
            return NextResponse.json({ error: executionsError.message }, { status: 500 });
        }

        // Buscar TODAS as assumptions do dia para estes checklists (não só do usuário logado)
        const todayKey = brazil.dateKey;
        const checklistIds = visibleChecklists.map((c: { id: string }) => c.id);

        const { data: allAssumptions } = await adminSupabase
            .from('checklist_assumptions')
            .select('checklist_id, user_id, user_name, completed_at')
            .eq('restaurant_id', restaurant_id)
            .eq('date_key', todayKey)
            .in('checklist_id', checklistIds);

        // Mapa de assumptions por checklist_id
        type AssumptionInfo = { user_id: string; user_name: string; completed_at: string | null };
        const assumptionMap = new Map<string, AssumptionInfo>(
            (allAssumptions ?? []).map((a: AssumptionInfo & { checklist_id: string }) => [a.checklist_id, a])
        );

        // Set de conclusões formais (qualquer assumption com completed_at preenchido)
        const completedSet = new Set<string>(
            (allAssumptions ?? [])
                .filter((a: AssumptionInfo & { checklist_id: string }) => a.completed_at !== null)
                .map((a: { checklist_id: string }) => a.checklist_id)
        );

        // Mapa de tarefas concluídas por checklist
        const doneCountMap = new Map<string, Set<string>>();
        for (const exec of executions ?? []) {
            if (exec.status === 'done') {
                if (!doneCountMap.has(exec.checklist_id)) {
                    doneCountMap.set(exec.checklist_id, new Set());
                }
                doneCountMap.get(exec.checklist_id)!.add(exec.task_id);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activities: MyActivity[] = (visibleChecklists as any[]).map((checklist) => {
            const rawCount = checklist.task_count;
            const taskCount = Array.isArray(rawCount)
                ? (rawCount[0]?.count ?? 0)
                : (rawCount ?? 0);

            const doneSet = doneCountMap.get(checklist.id);
            const doneCount = doneSet ? doneSet.size : 0;
            const progressPercent = taskCount > 0
                ? Math.round((doneCount / taskCount) * 100)
                : 0;

            // Expõe area ou role como 'area' para o frontend (fallback)
            const role = checklist.role ?? null;
            const area = checklist.area ?? null;
            const fallbackArea = area ? area : role;
            
            const assumption = assumptionMap.get(checklist.id);

            return {
                id: checklist.id,
                restaurant_id: checklist.restaurant_id,
                name: checklist.name,
                description: checklist.description ?? null,
                shift: checklist.shift,
                checklist_type: checklist.checklist_type ?? 'regular',
                is_required: checklist.is_required ?? false,
                start_time: checklist.start_time ?? null,
                end_time: checklist.end_time ?? null,
                target_role: (checklist.target_role ?? 'all') as TargetRole,
                area_id: checklist.area_id ?? checklist.role_id ?? null,
                order_index: checklist.order_index ?? null,
                area: fallbackArea ? { id: fallbackArea.id, name: fallbackArea.name, color: fallbackArea.color, restaurant_id: checklist.restaurant_id, priority_mode: fallbackArea.priority_mode ?? 'auto', created_at: '' } : null,
                task_count: taskCount,
                done_count: doneCount,
                progress_percent: progressPercent,
                activity_status: computeActivityStatus(checklist.end_time, taskCount, doneCount, completedSet.has(checklist.id), brazil.timeHHMM),
                assumed_by_name: assumption?.user_name ?? null,
                assumed_by_user_id: assumption?.user_id ?? null,
            };
        });

        return NextResponse.json(activities);
    } catch (error: unknown) {
        console.error('[GET /api/my-activities] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
