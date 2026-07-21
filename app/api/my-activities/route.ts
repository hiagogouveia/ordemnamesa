import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Area, MyActivity, MyActivityStatus, TargetRole } from '@/lib/types';
import { getNowInTz, getStartOfDayIsoInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';
import { OPERATIONAL_PREDICATE, fetchArchivedQuickIdsForToday } from '@/lib/utils/operational-activity';
import { fetchShiftIdsByChecklist, isVisibleByShiftIntersection } from '@/lib/api/shift-links';
import { filterExecutable } from '@/lib/api/area-links';

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

        // Sprint 61: turnos do colaborador (para segmentação de visibilidade).
        const { data: userShiftRows } = await adminSupabase
            .from('user_shifts')
            .select('shift_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const areaIds = (userAreaRows ?? []).map((r) => r.area_id);
        const roleIds = (userRoleRows ?? []).map((r) => r.role_id);
        const userShiftIds = (userShiftRows ?? []).map((r) => r.shift_id);

        // Sprint 92 — a visibilidade deixou de ser uma string `.or()` sobre `area_id`.
        // O embed `checklist_areas!inner` filtrado pelas áreas do usuário devolve o
        // superconjunto; `canExecuteChecklist` (via filterExecutable) decide.
        // INVARIANTE: rotinas sem nenhuma área NÃO são executáveis e NÃO aparecem no turno.
        const visibilityCtx = { userId: user.id, areaIds, roleIds };

        // Sem áreas atribuídas = sem atividades visíveis
        if (areaIds.length === 0) {
            return NextResponse.json([]);
        }

        // Checklists cuja area_id ou role_id está entre as áreas efetivas do usuário, ou atribuídos diretamente
        const checklistSelect = `
                id,
                restaurant_id,
                name,
                description,
                shift,
                shift_id,
                assigned_to_user_id,
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
                is_one_shot,
                area:areas(id, name, color, priority_mode),
                role:roles(id, name, color),
                task_count:checklist_tasks(count)
            `;
        const { data: rawChecklists, error: checklistsError } = await adminSupabase
            .from('checklists')
            .select(`${checklistSelect}, checklist_areas!inner(area_id)`)
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .eq('status', 'active')
            // Sprint 54: receivings recurring têm fluxo próprio em /admin/recebimentos;
            // quick receivings (is_one_shot=true) entram como atividade operacional do dia.
            .or(OPERATIONAL_PREDICATE)
            .in('checklist_areas.area_id', areaIds)
            .order('order_index', { ascending: true, nullsFirst: false });

        if (checklistsError) {
            console.error('[GET /api/my-activities] Erro ao buscar checklists:', checklistsError);
            return NextResponse.json({ error: checklistsError.message }, { status: 500 });
        }

        const checklistsData = await filterExecutable(adminSupabase, rawChecklists ?? [], visibilityCtx);

        // Sprint 66 — Segmentação por turno (visibilidade) no modelo N:N. Regra:
        //   - sem turno vinculado → vê tudo (opt-in);
        //   - atribuição direta ao usuário → sempre visível (prioridade);
        //   - rotina sem turnos (conjunto vazio) → "Todos os turnos" → visível;
        //   - interseção (turnos da rotina ∩ turnos do usuário) ≠ ∅ → visível.
        // Aplicada só ao conjunto base; merges (órfãos/quick) abaixo BYPASSAM.
        const applyShiftFilter = userShiftIds.length > 0;
        const baseShiftMap = await fetchShiftIdsByChecklist(
            adminSupabase,
            checklistsData.map((c) => c.id),
        );
        const baseChecklists = !applyShiftFilter
            ? checklistsData
            : checklistsData.filter((c) =>
                isVisibleByShiftIntersection(baseShiftMap.get(c.id) ?? [], userShiftIds, c.responsible_user_ids, user.id));

        // Reincorpora quick receivings arquivados hoje (active=false após conclusão s53)
        // para que permaneçam visíveis em Meu Turno até a virada do dia.
        const archivedQuickIds = await fetchArchivedQuickIdsForToday(adminSupabase, [restaurant_id]);
        let checklists = baseChecklists;
        if (archivedQuickIds.size > 0) {
            const knownIds = new Set(checklists.map((c: { id: string }) => c.id));
            const idsToFetch = Array.from(archivedQuickIds).filter((id) => !knownIds.has(id));
            if (idsToFetch.length > 0) {
                const { data: rawArchivedQuicks } = await adminSupabase
                    .from('checklists')
                    .select(`${checklistSelect}, checklist_areas(area_id)`)
                    .in('id', idsToFetch);
                const archivedQuicks = await filterExecutable(adminSupabase, rawArchivedQuicks ?? [], visibilityCtx);
                if (archivedQuicks.length > 0) {
                    checklists = [...checklists, ...archivedQuicks];
                }
            }
        }

        // Defesa em profundidade: reincorpora checklists com assumptions
        // in_progress mesmo quando active=false. Cobre cenários onde um
        // checklist foi arquivado durante uma execução em andamento
        // (migrações, decisão de gestor). Sem isso, o trabalho fica órfão.
        const { data: inProgressOrphans } = await adminSupabase
            .from('checklist_assumptions')
            .select('checklist_id')
            .eq('restaurant_id', restaurant_id)
            .eq('execution_status', 'in_progress');
        if (inProgressOrphans && inProgressOrphans.length > 0) {
            const knownIds = new Set(checklists.map((c: { id: string }) => c.id));
            const orphanIds = Array.from(new Set(
                inProgressOrphans.map((a: { checklist_id: string }) => a.checklist_id)
            )).filter((id) => !knownIds.has(id));
            if (orphanIds.length > 0) {
                const { data: rawOrphans } = await adminSupabase
                    .from('checklists')
                    .select(`${checklistSelect}, checklist_areas(area_id)`)
                    .in('id', orphanIds);
                const orphanChecklists = await filterExecutable(adminSupabase, rawOrphans ?? [], visibilityCtx);
                if (orphanChecklists.length > 0) {
                    checklists = [...checklists, ...orphanChecklists];
                }
            }
        }

        if (checklists.length === 0) {
            return NextResponse.json([]);
        }

        // Sprint 73 — fuso do restaurante (fonte da verdade) e filtragem de recorrência
        const tz = await getRestaurantTimezone(adminSupabase, restaurant_id);
        const brazil = getNowInTz(tz);
        const brazilDayStart = getStartOfDayIsoInTz(tz, brazil.dateKey);

        // Buscar shifts para resolver recurrence='shift_days'
        const { data: shifts } = await adminSupabase
            .from('shifts')
            .select('id, shift_type, days_of_week')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true);

        // Sprint 65 — Execução de recebimento é evento do dia, não rotina
        // recorrente: instância one-shot só aparece se foi assumida HOJE. Evita
        // que execuções de dias passados reapareçam como pendência nova.
        const { data: assumedTodayRows } = await adminSupabase
            .from('checklist_assumptions')
            .select('checklist_id')
            .eq('restaurant_id', restaurant_id)
            .eq('date_key', brazil.dateKey);
        const assumedTodayIds = new Set((assumedTodayRows ?? []).map((r: { checklist_id: string }) => r.checklist_id));

        // Anexa os turnos (N:N) a cada rotina para a recorrência usar a UNIÃO dos
        // dias dos turnos. Cobre também itens reincorporados pelos merges acima.
        const fullShiftMap = await fetchShiftIdsByChecklist(
            adminSupabase,
            checklists.map((c: { id: string }) => c.id),
        );
        for (const c of checklists as Array<{ id: string; shift_ids?: string[] }>) {
            c.shift_ids = fullShiftMap.get(c.id) ?? [];
        }

        const visibleChecklists = filterChecklistsByRecurrence(
            checklists,
            brazil.dayOfWeek,
            brazil.dateKey,
            shifts || [],
        ).filter((c: { is_one_shot?: boolean; id: string }) => !c.is_one_shot || assumedTodayIds.has(c.id));

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

        // Sprint 92 — metadados das áreas do restaurante (tabela pequena) para
        // montar `areas_list` a partir dos ids do N:N sem N+1.
        const { data: areaRows } = await adminSupabase
            .from('areas')
            .select('id, name, color, priority_mode, restaurant_id, created_at')
            .eq('restaurant_id', restaurant_id);
        const areaById = new Map((areaRows ?? []).map((a) => [a.id, a as unknown as Area]));

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
                shift_id: checklist.shift_id ?? null,
                shift_ids: checklist.shift_ids ?? [],
                checklist_type: checklist.checklist_type ?? 'regular',
                is_required: checklist.is_required ?? false,
                start_time: checklist.start_time ?? null,
                end_time: checklist.end_time ?? null,
                target_role: (checklist.target_role ?? 'all') as TargetRole,
                area_id: checklist.area_id ?? checklist.role_id ?? null,
                order_index: checklist.order_index ?? null,
                area: fallbackArea ? { id: fallbackArea.id, name: fallbackArea.name, color: fallbackArea.color, restaurant_id: checklist.restaurant_id, priority_mode: fallbackArea.priority_mode ?? 'auto', created_at: '' } : null,
                // Sprint 92 — áreas da rotina (N:N). As abas do Meu Turno casam por aqui.
                area_ids: (checklist.area_ids as string[] | undefined) ?? [],
                areas_list: ((checklist.area_ids as string[] | undefined) ?? [])
                    .map((id) => areaById.get(id))
                    .filter((a): a is Area => Boolean(a)),
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
