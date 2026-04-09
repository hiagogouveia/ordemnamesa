import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey } from '@/lib/utils/brazil-date';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

// Retorna IDs de assumptions que têm ao menos uma task_execution bloqueada.
// Assumptions com impedimento NÃO devem consumir o limite de rotinas simultâneas.
async function getBlockedAssumptionIds(
    supabase: ReturnType<typeof getAdminSupabase>,
    assumptionIds: string[]
): Promise<Set<string>> {
    if (assumptionIds.length === 0) return new Set();
    const { data } = await supabase
        .from('task_executions')
        .select('checklist_assumption_id')
        .in('checklist_assumption_id', assumptionIds)
        .eq('status', 'blocked');
    return new Set((data ?? []).map((e) => e.checklist_assumption_id as string));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: checklistId } = await params;
        const body = await request.json();
        const { restaurant_id } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // Prefer name from users table, then user_metadata, then email
        const { data: userRecord } = await adminSupabase
            .from('users')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();
        const userName = userRecord?.name || user.user_metadata?.name || user.email || 'Funcionário';
        const dateKey = getBrazilDateKey();

        // Verificar se já existe assumption para hoje (por qualquer pessoa)
        const { data: existing } = await adminSupabase
            .from('checklist_assumptions')
            .select('*')
            .eq('checklist_id', checklistId)
            .eq('date_key', dateKey)
            .maybeSingle();

        if (existing) {
            // Já assumida — retornar a assumption existente sem erro
            return NextResponse.json({ assumption: existing, alreadyAssumed: true });
        }

        // ── Validação de limite de atividades simultâneas ──

        // 1) Limite por CARGO (role) — global para o usuário
        const { data: userRoleRows } = await adminSupabase
            .from('user_roles')
            .select('role_id, roles:roles(id, max_concurrent_tasks)')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        let maxConcurrentByRole = Infinity;
        for (const row of userRoleRows ?? []) {
            const role = row.roles as unknown as { id: string; max_concurrent_tasks: number } | null;
            if (role && typeof role.max_concurrent_tasks === 'number') {
                maxConcurrentByRole = Math.min(maxConcurrentByRole, role.max_concurrent_tasks);
            }
        }

        if (maxConcurrentByRole !== Infinity) {
            const { data: roleAssumptions, error: countError } = await adminSupabase
                .from('checklist_assumptions')
                .select('id')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .eq('date_key', dateKey)
                .is('completed_at', null);

            if (countError) {
                console.error('[POST /api/checklists/[id]/assume] Erro ao contar assumptions:', countError);
                return NextResponse.json({ error: 'Erro ao validar limite' }, { status: 500 });
            }

            const roleIds = (roleAssumptions ?? []).map((a) => a.id);
            const roleBlockedIds = await getBlockedAssumptionIds(adminSupabase, roleIds);
            // Apenas rotinas em execução (doing) consomem o limite — blocked não contam
            const activeCount = roleIds.filter((id) => !roleBlockedIds.has(id)).length;

            if (activeCount >= maxConcurrentByRole) {
                return NextResponse.json(
                    {
                        error: 'Limite atingido',
                        message: `Você já atingiu o limite de ${maxConcurrentByRole} atividade${maxConcurrentByRole > 1 ? 's' : ''} simultânea${maxConcurrentByRole > 1 ? 's' : ''}. Finalize uma atividade antes de assumir outra.`,
                        code: 'LIMIT_REACHED',
                    },
                    { status: 409 }
                );
            }
        }

        // 2) Limite por ÁREA — por colaborador dentro da área
        const { data: checklist } = await adminSupabase
            .from('checklists')
            .select('area_id')
            .eq('id', checklistId)
            .single();

        if (checklist?.area_id) {
            const { data: area } = await adminSupabase
                .from('areas')
                .select('max_parallel_tasks')
                .eq('id', checklist.area_id)
                .single();

            const maxByArea = area?.max_parallel_tasks;

            // NULL = ilimitado, pular validação
            if (maxByArea != null) {
                // Buscar checklists da mesma área
                const areaChecklistIds =
                    (await adminSupabase
                        .from('checklists')
                        .select('id')
                        .eq('restaurant_id', restaurant_id)
                        .eq('area_id', checklist.area_id)
                    ).data?.map((c: { id: string }) => c.id) ?? [];

                // Contar assumptions in_progress deste usuário nesta área hoje
                const { data: areaAssumptions, error: areaCountError } = await adminSupabase
                    .from('checklist_assumptions')
                    .select('id')
                    .eq('restaurant_id', restaurant_id)
                    .eq('user_id', user.id)
                    .eq('date_key', dateKey)
                    .is('completed_at', null)
                    .in('checklist_id', areaChecklistIds);

                if (areaCountError) {
                    console.error('[POST /api/checklists/[id]/assume] Erro ao contar assumptions por área:', areaCountError);
                    return NextResponse.json({ error: 'Erro ao validar limite por área' }, { status: 500 });
                }

                const areaIds = (areaAssumptions ?? []).map((a) => a.id);
                const areaBlockedIds = await getBlockedAssumptionIds(adminSupabase, areaIds);
                // Apenas rotinas em execução (doing) consomem o limite — blocked não contam
                const areaActiveCount = areaIds.filter((id) => !areaBlockedIds.has(id)).length;

                if (areaActiveCount >= maxByArea) {
                    return NextResponse.json(
                        {
                            error: 'Limite por área atingido',
                            message: `Você já atingiu o limite de ${maxByArea} atividade${maxByArea > 1 ? 's' : ''} simultânea${maxByArea > 1 ? 's' : ''} nesta área.`,
                            code: 'AREA_LIMIT_REACHED',
                        },
                        { status: 409 }
                    );
                }
            }
        }

        const { data: assumption, error: insertError } = await adminSupabase
            .from('checklist_assumptions')
            .insert({
                restaurant_id,
                checklist_id: checklistId,
                user_id: user.id,
                user_name: userName,
                date_key: dateKey,
            })
            .select()
            .single();

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({ assumption, alreadyAssumed: false });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/[id]/assume] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: checklistId } = await params;
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const dateKey = getBrazilDateKey();

        const { data: assumption } = await adminSupabase
            .from('checklist_assumptions')
            .select('*')
            .eq('checklist_id', checklistId)
            .eq('restaurant_id', restaurant_id)
            .eq('date_key', dateKey)
            .maybeSingle();

        return NextResponse.json({ assumption: assumption || null });
    } catch (error: unknown) {
        console.error('[GET /api/checklists/[id]/assume] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
