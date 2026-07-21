import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutionStatus } from '@/lib/types';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';
import { fetchOpenTransfersByChecklist } from '@/lib/api/temporary-transfer';

/**
 * A "view" da rotina — o shape que o frontend consome.
 *
 * Fonte ÚNICA da forma de um checklist devolvido pela API. Existe porque o GET da lista e o PUT
 * divergiram: o PUT devolvia `*, roles, tasks` (sem o objeto `area`, sem `responsible`, sem
 * `shifts`), e o `useUpdateChecklist` escrevia essa resposta parcial direto no cache da listagem —
 * a linha piscava "Sem área" até o refetch chegar (e, no autosave, ficava mutilada).
 *
 * Qualquer endpoint que devolva uma rotina para a listagem DEVE usar `fetchChecklistViews`. Se um
 * relacionamento novo for exibido na lista, ele entra aqui — e os dois endpoints ganham juntos.
 */

/**
 * Relacionamentos que a listagem renderiza. `area`/`responsible` (singular) são as
 * sombras legadas; a fonte da verdade desde o s92 é o N:N `checklist_areas` /
 * `checklist_responsibles`, devolvido como `area_ids`/`areas_list`/`responsibles`.
 */
export const CHECKLIST_VIEW_SELECT = `
    *,
    roles ( id, name, color ),
    area:areas!area_id ( id, name, color ),
    responsible:users!assigned_to_user_id ( id, name ),
    checklist_shifts ( shift_id, shifts ( id, name ) ),
    checklist_areas ( area_id, areas ( id, name, color ) ),
    checklist_responsibles ( user_id, users ( id, name ) ),
    tasks:checklist_tasks (*)
`;

export interface UnitInfo {
    id: string;
    name: string;
}

interface ChecklistRow {
    id: string;
    restaurant_id: string;
    tasks?: { order: number }[];
    checklist_shifts?: Array<{ shift_id: string; shifts: { id: string; name: string } | null }>;
    checklist_areas?: Array<{ area_id: string; areas: { id: string; name: string; color: string } | null }>;
    checklist_responsibles?: Array<{ user_id: string; users: { id: string; name: string } | null }>;
    [key: string]: unknown;
}

interface AssumptionRow {
    id: string;
    checklist_id: string;
    user_id: string;
    user_name: string | null;
    execution_status: 'in_progress' | 'blocked' | 'done';
    completed_at: string | null;
    blocked_reason: string | null;
}

/** Map user_id → { id, name }. Só os ids realmente usados (dedup antes da query). */
async function fetchUserNames(
    admin: SupabaseClient,
    userIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
    const map = new Map<string, { id: string; name: string }>();
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return map;

    const { data } = await admin.from('users').select('id, name').in('id', ids);
    for (const u of (data ?? []) as Array<{ id: string; name: string | null }>) {
        map.set(u.id, { id: u.id, name: u.name ?? 'Colaborador' });
    }
    return map;
}

export interface FetchChecklistViewsOptions {
    restaurantIds: string[];
    /** Restringe a rotinas específicas (usado pelo PUT para devolver uma só). */
    checklistIds?: string[];
    /** Instâncias one-shot (recebimentos rápidos) ficam fora das listagens administrativas. */
    includeOneShot?: boolean;
    /** Nome das unidades, para o campo `unit` (visão global). Buscado sob demanda se ausente. */
    unitsById?: Record<string, UnitInfo>;
}

/**
 * Busca rotinas já no formato que a listagem consome: relacionamentos embedados + campos derivados
 * (`execution_status`, `assumed_by_*`, `shifts`/`shift_ids`, `tasks` ordenadas, `unit`).
 */
export async function fetchChecklistViews(
    admin: SupabaseClient,
    options: FetchChecklistViewsOptions,
): Promise<Record<string, unknown>[]> {
    const { restaurantIds, checklistIds, includeOneShot = false } = options;
    if (restaurantIds.length === 0) return [];

    const tz = await getRestaurantTimezone(admin, restaurantIds[0]);
    const todayKey = getNowInTz(tz).dateKey;

    const buildQuery = (orderColumn: 'order_index' | 'created_at') => {
        const q = admin
            .from('checklists')
            .select(CHECKLIST_VIEW_SELECT)
            .in('restaurant_id', restaurantIds)
            .order(orderColumn, { ascending: orderColumn === 'order_index' });
        if (checklistIds) q.in('id', checklistIds);
        if (!includeOneShot) q.eq('is_one_shot', false);
        return q;
    };

    // s94 — a transferência temporária viva entra como QUERY SEPARADA (mesmo padrão de
    // `assumptionMap`/`blockedTasksResult` logo abaixo), e não como embed PostgREST.
    // Um embed traria também o histórico encerrado — que cresce sem limite — e filtrar
    // embed depende de sintaxe sutil (`!inner` altera o filtro do pai). A query separada
    // é coberta pelo índice parcial `idx_ctt_open_window` e devolve no máximo 1 linha
    // por rotina (garantido pelo índice único `uq_ctt_one_open`).
    const [checklistsResult, assumptionsResult, blockedTasksResult] = await Promise.all([
        buildQuery('order_index'),
        admin
            .from('checklist_assumptions')
            .select('id, checklist_id, user_id, user_name, execution_status, completed_at, blocked_reason')
            .in('restaurant_id', restaurantIds)
            .eq('date_key', todayKey),
        // s90 — esta query estava MORTA: consultava `task_executions.status='blocked'`,
        // status que o s45 removeu do CHECK ao migrar impedimentos para `task_issues`.
        // Retornava sempre [], então `execution_status='blocked'` nunca era atribuído e
        // o status "com impedimento" simplesmente não existia na UI — apesar de o filtro
        // e o getOperationalStatus já saberem lidar com ele.
        //
        // Reapontada para a fonte de verdade real: uma rotina está impedida quando tem
        // ocorrência ABERTA de severidade 'blocker'. Ocorrência comum ('normal') não
        // trava a rotina — foi justamente essa a separação que o s45 introduziu.
        admin
            .from('task_issues')
            .select('checklist_id, checklist_assumption_id')
            .in('restaurant_id', restaurantIds)
            .eq('severity', 'blocker')
            .in('status', ['open', 'investigating']),
    ]);

    let checklists = checklistsResult.data as ChecklistRow[] | null;
    const error = checklistsResult.error;

    if (error) {
        // Fallback histórico: instalações sem a coluna `order_index`.
        if (error.code === '42703' || error.message.includes('order_index')) {
            const fallback = await buildQuery('created_at');
            if (fallback.error) throw fallback.error;
            checklists = fallback.data as unknown as ChecklistRow[];
        } else {
            throw error;
        }
    }

    // Unidades: só busca se o caller não passou (o GET já resolve no escopo).
    let unitsById = options.unitsById;
    if (!unitsById) {
        const { data: rests } = await admin
            .from('restaurants')
            .select('id, name')
            .in('id', restaurantIds);
        unitsById = {};
        for (const r of (rests ?? []) as UnitInfo[]) unitsById[r.id] = { id: r.id, name: r.name };
    }

    const assumptionMap = new Map<string, AssumptionRow>(
        ((assumptionsResult.data ?? []) as AssumptionRow[]).map(a => [a.checklist_id, a]),
    );

    // s94 — transferências vivas + nomes dos dois envolvidos, para o badge e o tooltip.
    // Buscada DEPOIS das rotinas porque depende dos ids já resolvidos (e porque a lista
    // costuma ser curta: só rotinas com transferência aberta produzem linha).
    const transferMap = await fetchOpenTransfersByChecklist(
        admin,
        (checklists ?? []).map((c) => c.id),
    );
    const transferUserNames = await fetchUserNames(
        admin,
        [...transferMap.values()].flatMap((t) => [t.original_user_id, t.temporary_user_id]),
    );

    const assumptionIdsWithBlockedTasks = new Set<string>(
        ((blockedTasksResult.data ?? []) as Array<{ checklist_assumption_id: string | null }>)
            .filter(te => te.checklist_assumption_id)
            .map(te => te.checklist_assumption_id as string),
    );

    return (checklists ?? []).map((checklist) => {
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

        const unit = unitsById![checklist.restaurant_id];

        // s94 — SÓ EXIBIÇÃO. O responsável efetivo já está em `responsible_user_ids`
        // (o reconciliador fez o swap na junção); este objeto existe para o badge
        // "Temporário" saber quem é o original e até quando a cobertura vai.
        const transfer = transferMap.get(checklist.id);
        const temporary_transfer = transfer
            ? {
                id: transfer.id,
                checklist_id: transfer.checklist_id,
                original: transferUserNames.get(transfer.original_user_id) ?? null,
                temporary: transferUserNames.get(transfer.temporary_user_id) ?? null,
                starts_on: transfer.starts_on,
                ends_on: transfer.ends_on,
                status: transfer.status,
                reason_code: transfer.reason_code,
                reason_note: transfer.reason_note,
            }
            : null;
        // Sprint 66: turnos N:N → shift_ids + shifts (id, name) para exibição.
        const shiftLinks = checklist.checklist_shifts ?? [];
        const shiftIds = shiftLinks.map(l => l.shift_id);
        const shiftObjs = shiftLinks
            .map(l => l.shifts)
            .filter((s): s is { id: string; name: string } => Boolean(s));

        // Sprint 92: áreas e responsáveis N:N → listas ordenadas por nome para exibição.
        const areaLinks = (checklist.checklist_areas ?? [])
            .filter((l) => Boolean(l.areas))
            .sort((a, b) => (a.areas!.name).localeCompare(b.areas!.name));
        const responsibleLinks = (checklist.checklist_responsibles ?? [])
            .filter((l) => Boolean(l.users))
            .sort((a, b) => (a.users!.name ?? '').localeCompare(b.users!.name ?? ''));

        return {
            ...checklist,
            checklist_shifts: undefined,
            checklist_areas: undefined,
            checklist_responsibles: undefined,
            shift_ids: shiftIds,
            shifts: shiftObjs,
            area_ids: areaLinks.map((l) => l.area_id),
            areas_list: areaLinks.map((l) => l.areas!),
            responsible_user_ids: responsibleLinks.map((l) => l.user_id),
            responsibles: responsibleLinks.map((l) => l.users!),
            tasks: (checklist.tasks ?? []).sort((a, b) => a.order - b.order),
            execution_status,
            assumed_by_name: assumption?.user_name ?? null,
            assumed_by_user_id: assumption?.user_id ?? null,
            unit: unit ? { id: unit.id, name: unit.name } : null,
            temporary_transfer,
        };
    });
}
