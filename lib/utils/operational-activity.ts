import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrazilDateKey } from './brazil-date'

/**
 * Predicado canônico: "execução operacional visível".
 * Inclui rotinas normais E quick receivings (is_one_shot=true).
 * Exclui receivings recurring — esses têm fluxo próprio em /admin/recebimentos.
 *
 * Uso sem join:    .or(OPERATIONAL_PREDICATE)
 * Uso com join:    .or(OPERATIONAL_PREDICATE, { foreignTable: 'checklists' })
 */
export const OPERATIONAL_PREDICATE = 'checklist_type.neq.receiving,is_one_shot.eq.true'

/**
 * Quicks ficam arquivados após conclusão (sprint s53: active=false, status='archived').
 * Queries que filtram active=true deixam-os fora. Esta função retorna os checklist_ids
 * dos quicks concluídos hoje (date_key brasileiro) que devem reentrar nas superfícies do dia
 * (Meu Turno, Kanban, Dashboard).
 */
export async function fetchArchivedQuickIdsForToday(
    supabase: SupabaseClient,
    restaurantIds: string[],
    dateKey: string = getBrazilDateKey(),
): Promise<Set<string>> {
    if (restaurantIds.length === 0) return new Set()
    const { data, error } = await supabase
        .from('checklist_assumptions')
        .select('checklist_id, checklists!inner(is_one_shot, active)')
        .in('restaurant_id', restaurantIds)
        .eq('date_key', dateKey)
        .eq('checklists.is_one_shot', true)
        .eq('checklists.active', false)
    if (error) throw error
    return new Set((data ?? []).map((r) => r.checklist_id as string))
}
