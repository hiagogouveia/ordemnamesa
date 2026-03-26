import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { MyActivity, MyActivityStatus, TargetRole } from '@/lib/types';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

function computeActivityStatus(
    endTime: string | null | undefined,
    taskCount: number,
    doneCount: number,
    isFormallyConcluded: boolean
): MyActivityStatus {
    if (isFormallyConcluded) return 'done_today';
    if (taskCount === 0) return 'pending';
    if (doneCount >= taskCount) return 'done_today';
    const nowHHMM = new Date().toTimeString().slice(0, 5);
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

        // Buscar as funções (roles) atribuídas ao usuário — mesmo sistema do turno
        const { data: userRoleRows } = await adminSupabase
            .from('user_roles')
            .select('role_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const userRoleIds = (userRoleRows ?? []).map((r) => r.role_id);

        // Sem funções atribuídas → sem atividades
        if (userRoleIds.length === 0) {
            return NextResponse.json([]);
        }

        // Checklists cujo role_id está entre as funções do usuário
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
                role:roles(id, name, color),
                task_count:checklist_tasks(count)
            `)
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .eq('status', 'active')
            .not('role_id', 'is', null)
            .in('role_id', userRoleIds)
            .order('order_index', { ascending: true, nullsFirst: false });

        if (checklistsError) {
            console.error('[GET /api/my-activities] Erro ao buscar checklists:', checklistsError);
            return NextResponse.json({ error: checklistsError.message }, { status: 500 });
        }

        if (!checklists || checklists.length === 0) {
            return NextResponse.json([]);
        }

        // Execuções do dia para calcular progresso
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: executions, error: executionsError } = await adminSupabase
            .from('task_executions')
            .select('checklist_id, task_id, status')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .gte('executed_at', startOfDay.toISOString());

        if (executionsError) {
            console.error('[GET /api/my-activities] Erro ao buscar execuções:', executionsError);
            return NextResponse.json({ error: executionsError.message }, { status: 500 });
        }

        // Conclusões formais do dia (completed_at definido) — fonte de verdade imutável
        const todayKey = startOfDay.toISOString().split('T')[0];

        const { data: assumptions } = await adminSupabase
            .from('checklist_assumptions')
            .select('checklist_id, completed_at')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('date_key', todayKey)
            .not('completed_at', 'is', null);

        const completedSet = new Set<string>(
            (assumptions ?? []).map((a: { checklist_id: string; completed_at: string }) => a.checklist_id)
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
        const activities: MyActivity[] = (checklists as any[]).map((checklist) => {
            const rawCount = checklist.task_count;
            const taskCount = Array.isArray(rawCount)
                ? (rawCount[0]?.count ?? 0)
                : (rawCount ?? 0);

            const doneSet = doneCountMap.get(checklist.id);
            const doneCount = doneSet ? doneSet.size : 0;
            const progressPercent = taskCount > 0
                ? Math.round((doneCount / taskCount) * 100)
                : 0;

            // Expõe role como 'area' para reutilizar o filtro do frontend (mesma estrutura: id, name, color)
            const role = checklist.role ?? null;
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
                area_id: checklist.role_id ?? null,   // usa role_id no lugar de area_id
                area: role ? { id: role.id, name: role.name, color: role.color, restaurant_id: checklist.restaurant_id, created_at: '' } : null,
                task_count: taskCount,
                done_count: doneCount,
                progress_percent: progressPercent,
                activity_status: computeActivityStatus(checklist.end_time, taskCount, doneCount, completedSet.has(checklist.id)),
            };
        });

        return NextResponse.json(activities);
    } catch (error: unknown) {
        console.error('[GET /api/my-activities] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
