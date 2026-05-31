import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilNow, getBrazilStartAndEndOfDay } from '@/lib/utils/brazil-date';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';
import { resolveGlobalScope, isGlobalScopeResult } from '@/lib/api/global-scope';
import { fetchArchivedQuickIdsForToday } from '@/lib/utils/operational-activity';
import { fetchShiftIdsByChecklist, isVisibleByShiftIntersection } from '@/lib/api/shift-links';

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
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // ── Resolver escopo ──────────────────────────────────────────────
        let restaurantIds: string[] = [];
        const unitsById: Record<string, { id: string; name: string }> = {};

        if (isGlobal) {
            const scopeResult = await resolveGlobalScope(adminSupabase, account_id!, user.id);
            if (!isGlobalScopeResult(scopeResult)) return scopeResult; // 403
            restaurantIds = scopeResult.restaurantIds;
            Object.assign(unitsById, scopeResult.unitsById);
        } else {
            restaurantIds = [restaurant_id!];
        }

        // 1. Obter areas e roles do usuário nas unidades em escopo
        const { data: userAreas } = await adminSupabase
            .from('user_areas')
            .select('area_id')
            .in('restaurant_id', restaurantIds)
            .eq('user_id', user.id);

        const { data: userRoles } = await adminSupabase
            .from('user_roles')
            .select('role_id')
            .in('restaurant_id', restaurantIds)
            .eq('user_id', user.id);

        const areaIds = userAreas?.map(ua => ua.area_id) || [];
        const roleIds = userRoles?.map(ur => ur.role_id) || [];

        // Sprint 61 — Segmentação por turno em "Meu Turno" (visão operacional
        // pessoal): aplica para TODOS os perfis (staff/manager/owner). A exceção
        // "owner/manager vê tudo" vale só para telas administrativas, não aqui.
        // Sem turno vinculado → vê tudo (opt-in). Modo global (gestão multi-unidade)
        // não tem user_shifts por unidade → sem filtro.
        let userShiftIds: string[] = [];
        if (!isGlobal) {
            const { data: userShiftRows } = await adminSupabase
                .from('user_shifts')
                .select('shift_id')
                .eq('restaurant_id', restaurant_id!)
                .eq('user_id', user.id);
            userShiftIds = (userShiftRows ?? []).map(r => r.shift_id);
        }
        const applyShiftFilter = userShiftIds.length > 0;

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

        const checklistSelect = 'id, name, description, shift, shift_id, is_required, recurrence, recurrence_config, last_reset_at, assigned_to_user_id, role_id, area_id, order_index, restaurant_id, roles(id, name, color), areas(id, name, color), checklist_type, start_time, end_time, is_one_shot, supplier_id, source_template_id';

        const { data: activeChecklistsData } = await adminSupabase
            .from('checklists')
            .select(checklistSelect)
            .in('restaurant_id', restaurantIds)
            .eq('active', true)
            .eq('status', 'active')
            .or(checklistFilterParts.join(','))
            .order('order_index', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true });

        // Timezone Brasil para todas as operações de data
        const brazil = getBrazilNow();
        const { start: brazilDayStart, end: brazilDayEnd } = getBrazilStartAndEndOfDay();

        // Sprint 54: quick receivings concluídos hoje ficam arquivados (active=false).
        // Reincorporamos via segunda query para que permaneçam visíveis em Meu Turno
        // até a virada do dia.
        const archivedQuickIds = await fetchArchivedQuickIdsForToday(adminSupabase, restaurantIds, brazil.dateKey);
        // Sprint 66 — Filtro de turno por INTERSEÇÃO no conjunto base; merges de
        // quick receivings arquivados e órfãos in_progress (abaixo) bypassam.
        const baseShiftMap = await fetchShiftIdsByChecklist(
            adminSupabase,
            (activeChecklistsData || []).map((c: { id: string }) => c.id),
        );
        let activeChecklists = applyShiftFilter
            ? (activeChecklistsData || []).filter((c: { id: string; assigned_to_user_id?: string | null }) =>
                isVisibleByShiftIntersection(baseShiftMap.get(c.id) ?? [], userShiftIds, c.assigned_to_user_id, user.id))
            : (activeChecklistsData || []);
        if (archivedQuickIds.size > 0) {
            const knownIds = new Set(activeChecklists.map((c: { id: string }) => c.id));
            const idsToFetch = Array.from(archivedQuickIds).filter((id) => !knownIds.has(id));
            if (idsToFetch.length > 0) {
                const { data: archivedQuicks } = await adminSupabase
                    .from('checklists')
                    .select(checklistSelect)
                    .in('id', idsToFetch)
                    .or(checklistFilterParts.join(','));
                if (archivedQuicks && archivedQuicks.length > 0) {
                    activeChecklists = [...activeChecklists, ...archivedQuicks];
                }
            }
        }

        // Defesa em profundidade: assumptions in_progress órfãs (checklist
        // active=false e não é one-shot). Acontece quando um checklist é
        // arquivado enquanto há trabalho em andamento (migrações, decisão
        // de gestor). Sem essa reincorporação a execução fica invisível.
        const { data: inProgressOrphans } = await adminSupabase
            .from('checklist_assumptions')
            .select('checklist_id')
            .in('restaurant_id', restaurantIds)
            .eq('execution_status', 'in_progress');
        if (inProgressOrphans && inProgressOrphans.length > 0) {
            const knownIds = new Set(activeChecklists.map((c: { id: string }) => c.id));
            const orphanIds = Array.from(new Set(
                inProgressOrphans.map((a: { checklist_id: string }) => a.checklist_id)
            )).filter((id) => !knownIds.has(id));
            if (orphanIds.length > 0) {
                const { data: orphanChecklists } = await adminSupabase
                    .from('checklists')
                    .select(checklistSelect)
                    .in('id', orphanIds)
                    .or(checklistFilterParts.join(','));
                if (orphanChecklists && orphanChecklists.length > 0) {
                    activeChecklists = [...activeChecklists, ...orphanChecklists];
                }
            }
        }

        // Buscar shifts para resolver recurrence='shift_days'
        const { data: shifts } = await adminSupabase
            .from('shifts')
            .select('id, shift_type, days_of_week')
            .in('restaurant_id', restaurantIds)
            .eq('active', true);

        // Sprint 65 — Execução de recebimento é um evento do dia, NÃO uma rotina
        // recorrente: uma instância one-shot só aparece se foi assumida HOJE.
        // Isso desacopla a execução da lógica de recorrência e evita que
        // instâncias antigas (in_progress de dias passados) reapareçam como
        // pendência nova. Auto-corrige dados legados (sem saneamento de visibilidade).
        const { data: assumedTodayRows } = await adminSupabase
            .from('checklist_assumptions')
            .select('checklist_id')
            .in('restaurant_id', restaurantIds)
            .eq('date_key', brazil.dateKey);
        const assumedTodayIds = new Set((assumedTodayRows ?? []).map((r: { checklist_id: string }) => r.checklist_id));

        // Anexa turnos (N:N) a cada rotina → recorrência usa a UNIÃO dos dias.
        const fullShiftMap = await fetchShiftIdsByChecklist(
            adminSupabase,
            (activeChecklists || []).map((c: { id: string }) => c.id),
        );
        for (const c of (activeChecklists || []) as Array<{ id: string; shift_ids?: string[] }>) {
            c.shift_ids = fullShiftMap.get(c.id) ?? [];
        }

        // Filtrar checklists por regras de recorrência (dia da semana, custom, etc.)
        const visibleChecklists = filterChecklistsByRecurrence(
            activeChecklists || [],
            brazil.dayOfWeek,
            brazil.dateKey,
            shifts || [],
        ).filter((c) => !c.is_one_shot || assumedTodayIds.has(c.id));

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
            // Sprint 65: execução one-shot não é recorrente — nunca resetar suas
            // tarefas (protege execuções legadas com recurrence='daily').
            if (cl.is_one_shot) continue;

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
                const clRestaurantId = (cl as { restaurant_id?: string }).restaurant_id || restaurantIds[0];
                await adminSupabase
                    .from('task_executions')
                    .delete()
                    .eq('restaurant_id', clRestaurantId)
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
                .in('restaurant_id', restaurantIds)
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

        // 3. Buscar execuções de HOJE para ESTE USUÁRIO nas unidades em escopo
        const { data: executions } = await adminSupabase
            .from('task_executions')
            .select('*')
            .in('restaurant_id', restaurantIds)
            .eq('user_id', user.id)
            .gte('executed_at', brazilDayStart)
            .lte('executed_at', brazilDayEnd);

        // 4. Buscar assumptions de HOJE nas unidades em escopo
        const todayKey = brazil.dateKey;
        const { data: assumptions } = await adminSupabase
            .from('checklist_assumptions')
            .select('*')
            .in('restaurant_id', restaurantIds)
            .eq('date_key', todayKey);

        return NextResponse.json({
            checklists: visibleChecklists,
            tasks: tasksData || [],
            executions: executions || [],
            assumptions: assumptions || [],
            ...(isGlobal ? { units_by_id: unitsById } : {}),
        });

    } catch (error: unknown) {
        console.error('[GET /api/tasks/kanban] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
