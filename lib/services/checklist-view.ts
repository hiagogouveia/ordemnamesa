import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutionStatus } from '@/lib/types';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';

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

/** Relacionamentos que a listagem renderiza. `area` é objeto embedado, não só `area_id`. */
export const CHECKLIST_VIEW_SELECT = `
    *,
    roles ( id, name, color ),
    area:areas!area_id ( id, name, color ),
    responsible:users!assigned_to_user_id ( id, name ),
    checklist_shifts ( shift_id, shifts ( id, name ) ),
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

    const [checklistsResult, assumptionsResult, blockedTasksResult] = await Promise.all([
        buildQuery('order_index'),
        admin
            .from('checklist_assumptions')
            .select('id, checklist_id, user_id, user_name, execution_status, completed_at, blocked_reason')
            .in('restaurant_id', restaurantIds)
            .eq('date_key', todayKey),
        admin
            .from('task_executions')
            .select('checklist_id, checklist_assumption_id')
            .in('restaurant_id', restaurantIds)
            .eq('status', 'blocked')
            .gte('executed_at', new Date(todayKey).toISOString()),
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
        // Sprint 66: turnos N:N → shift_ids + shifts (id, name) para exibição.
        const shiftLinks = checklist.checklist_shifts ?? [];
        const shiftIds = shiftLinks.map(l => l.shift_id);
        const shiftObjs = shiftLinks
            .map(l => l.shifts)
            .filter((s): s is { id: string; name: string } => Boolean(s));

        return {
            ...checklist,
            checklist_shifts: undefined,
            shift_ids: shiftIds,
            shifts: shiftObjs,
            tasks: (checklist.tasks ?? []).sort((a, b) => a.order - b.order),
            execution_status,
            assumed_by_name: assumption?.user_name ?? null,
            assumed_by_user_id: assumption?.user_id ?? null,
            unit: unit ? { id: unit.id, name: unit.name } : null,
        };
    });
}
