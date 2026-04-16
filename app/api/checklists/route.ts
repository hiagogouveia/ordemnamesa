import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ExecutionStatus } from '@/lib/types';
import { getBrazilDateKey } from '@/lib/utils/brazil-date';
import { canUseGlobal } from '@/lib/supabase/accounts';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

function rejectIfGlobal(request: Request): NextResponse | null {
    const mode = new URL(request.url).searchParams.get('mode');
    if (mode === 'global') {
        return NextResponse.json(
            { error: 'Operação bloqueada em Visão Global. Selecione uma unidade.' },
            { status: 403 }
        );
    }
    return null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const account_id = searchParams.get('account_id');
        const mode = searchParams.get('mode');
        const isGlobal = mode === 'global';

        if (!isGlobal && !restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }
        if (isGlobal && !account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório em modo global' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Referencie Headers.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[GET /api/checklists] User check failed:', userError);
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        let restaurantIds: string[] = [];
        const unitsById: Record<string, { id: string; name: string }> = {};

        if (isGlobal) {
            const { allowed, units } = await canUseGlobal(adminSupabase, account_id!, user.id);
            if (!allowed) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
            restaurantIds = units.map((u) => u.id);
            for (const u of units) unitsById[u.id] = { id: u.id, name: u.name };
        } else {
            const { data: userRole } = await adminSupabase
                .from('restaurant_users')
                .select('role')
                .eq('restaurant_id', restaurant_id!)
                .eq('user_id', user.id)
                .eq('active', true)
                .single();

            if (!userRole) {
                return NextResponse.json({ error: 'Permissões do restaurante não encontradas' }, { status: 403 });
            }
            const { data: rest } = await adminSupabase
                .from('restaurants')
                .select('id, name')
                .eq('id', restaurant_id!)
                .maybeSingle<{ id: string; name: string }>();
            if (rest) unitsById[rest.id] = { id: rest.id, name: rest.name };
            restaurantIds = [restaurant_id!];
        }

        if (restaurantIds.length === 0) {
            return NextResponse.json([]);
        }

        const todayKey = getBrazilDateKey();

        const [checklistsResult, assumptionsResult, blockedTasksResult] = await Promise.all([
            adminSupabase
                .from('checklists')
                .select(`
                    *,
                    roles ( id, name, color ),
                    area:areas!area_id ( id, name, color ),
                    responsible:users!assigned_to_user_id ( id, name ),
                    tasks:checklist_tasks (*)
                `)
                .in('restaurant_id', restaurantIds)
                .order('order_index', { ascending: true }),
            adminSupabase
                .from('checklist_assumptions')
                .select('id, checklist_id, user_id, user_name, execution_status, completed_at, blocked_reason')
                .in('restaurant_id', restaurantIds)
                .eq('date_key', todayKey),
            adminSupabase
                .from('task_executions')
                .select('checklist_id, checklist_assumption_id')
                .in('restaurant_id', restaurantIds)
                .eq('status', 'blocked')
                .gte('executed_at', new Date(todayKey).toISOString()),
        ]);

        let { data: checklists, error } = checklistsResult;

        if (error) {
            // Fallback se order_index não existir
            if (error.code === '42703' || error.message.includes('order_index')) {
                const fallbackFetch = await adminSupabase
                    .from('checklists')
                    .select(`
                        *,
                        roles ( id, name, color ),
                        area:areas!area_id ( id, name, color ),
                        responsible:users!assigned_to_user_id ( id, name ),
                        tasks:checklist_tasks (*)
                    `)
                    .in('restaurant_id', restaurantIds)
                    .order('created_at', { ascending: false });

                if (fallbackFetch.error) {
                    console.error('[GET /api/checklists] Falha Fetch Fallback Checklists:', fallbackFetch.error);
                    return NextResponse.json({ error: fallbackFetch.error.message }, { status: 500 });
                }
                checklists = fallbackFetch.data;
            } else {
                console.error('[GET /api/checklists] Falha Fetch Checklists:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }

        // Mapa de assumptions por checklist_id para derivar execution_status
        type AssumptionRow = {
            id: string;
            checklist_id: string;
            user_id: string;
            user_name: string | null;
            execution_status: 'in_progress' | 'blocked' | 'done';
            completed_at: string | null;
            blocked_reason: string | null;
        };
        const assumptionMap = new Map<string, AssumptionRow>(
            (assumptionsResult.data ?? []).map((a: AssumptionRow) => [a.checklist_id, a])
        );

        // Set de assumption_ids que têm task_executions bloqueadas
        const assumptionIdsWithBlockedTasks = new Set<string>(
            (blockedTasksResult.data ?? [])
                .filter((te: { checklist_assumption_id: string | null }) => te.checklist_assumption_id)
                .map((te: { checklist_assumption_id: string }) => te.checklist_assumption_id)
        );

        interface ChecklistRow {
            id: string;
            restaurant_id: string;
            tasks?: { order: number }[];
            [key: string]: unknown;
        }

        const formattedChecklists = (checklists ?? []).map((checklist: ChecklistRow) => {
            const assumption = assumptionMap.get(checklist.id);

            let execution_status: ExecutionStatus;
            if (!assumption) {
                execution_status = 'not_started';
            } else if (assumption.completed_at !== null || assumption.execution_status === 'done') {
                execution_status = 'done';
            } else if (assumptionIdsWithBlockedTasks.has(assumption.id)) {
                execution_status = 'blocked';
            } else {
                execution_status = 'in_progress';
            }

            const unit = unitsById[checklist.restaurant_id];
            return {
                ...checklist,
                tasks: (checklist.tasks ?? []).sort((a: { order: number }, b: { order: number }) => a.order - b.order),
                execution_status,
                assumed_by_name: assumption?.user_name ?? null,
                assumed_by_user_id: assumption?.user_id ?? null,
                unit: unit ? { id: unit.id, name: unit.name } : null,
            };
        });

        return NextResponse.json(formattedChecklists);
    } catch (error: unknown) {
        console.error('[GET /api/checklists] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const blocked = rejectIfGlobal(request);
        if (blocked) return blocked;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[POST /api/checklists] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, description, shift, status, tasks, category, role_id, is_required, checklist_type, assigned_to_user_id, recurrence, start_time, end_time, recurrence_config, enforce_sequential_order, area_id, target_role, assignment_type } = body;

        if (!restaurant_id || !name || !shift) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        if (!area_id) {
            return NextResponse.json({ error: 'Selecione uma área para a rotina.' }, { status: 400 });
        }

        if (status === 'active' && (!Array.isArray(tasks) || tasks.length === 0)) {
            return NextResponse.json(
                { error: 'Adicione ao menos uma tarefa para publicar a rotina.', code: 'NO_TASKS' },
                { status: 400 }
            );
        }

        if (recurrence === 'custom') {
            const days = recurrence_config?.days_of_week;
            if (!Array.isArray(days) || days.length === 0) {
                return NextResponse.json(
                    { error: 'Recorrência personalizada exige ao menos um dia da semana selecionado.' },
                    { status: 400 }
                );
            }
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
        }

        // Validação de domínio: responsável deve pertencer à área selecionada
        if (assigned_to_user_id && area_id) {
            const { data: userArea } = await adminSupabase
                .from('user_areas')
                .select('id')
                .eq('user_id', assigned_to_user_id)
                .eq('area_id', area_id)
                .maybeSingle();

            if (!userArea) {
                return NextResponse.json(
                    { error: 'O colaborador selecionado não pertence à área escolhida.' },
                    { status: 422 }
                );
            }
        }

        // 1. Criar o Checklist
        const { data: newChecklist, error: checklistError } = await adminSupabase
            .from('checklists')
            .insert({
                restaurant_id,
                name,
                description,
                shift,
                category,
                status,
                role_id,
                is_required: is_required !== undefined ? is_required : true,
                checklist_type: checklist_type || 'regular',
                assigned_to_user_id: assigned_to_user_id || null,
                recurrence: recurrence && recurrence !== 'none' ? recurrence : 'daily',
                start_time: start_time || null,
                end_time: end_time || null,
                recurrence_config: recurrence_config || null,
                enforce_sequential_order: enforce_sequential_order !== undefined ? enforce_sequential_order : false,
                area_id: area_id || null,
                target_role: target_role || 'all',
                assignment_type: assignment_type || (assigned_to_user_id ? 'user' : (area_id ? 'area' : 'all')),
                active: true,
                created_by: user.id
            })
            .select()
            .single();

        if (checklistError) {
            console.error('[POST /api/checklists] Erro ao criar checklist mestre:', checklistError);
            return NextResponse.json({ error: checklistError.message }, { status: 500 });
        }

        // 2. Inserir Tasks com Rollback
        let insertedTasks = [];
        if (tasks && tasks.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasksToInsert = tasks.map((task: any, index: number) => ({
                checklist_id: newChecklist.id,
                restaurant_id,
                title: task.title,
                description: task.description,
                requires_photo: task.requires_photo || false,
                is_critical: task.is_critical || false,
                order: index,
                assigned_to_user_id: task.assigned_to_user_id || null
            }));

            const { data: newTasks, error: tasksError } = await adminSupabase
                .from('checklist_tasks')
                .insert(tasksToInsert)
                .select();

            if (tasksError) {
                console.error('[POST /api/checklists] Erro nas tasks, realizando rollback:', tasksError);
                await adminSupabase.from('checklists').delete().eq('id', newChecklist.id);
                return NextResponse.json({ error: tasksError.message }, { status: 500 });
            }
            insertedTasks = newTasks.sort((a, b) => a.order - b.order);
        }

        return NextResponse.json({ ...newChecklist, tasks: insertedTasks }, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/checklists] Erro Interno Desconhecido:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
