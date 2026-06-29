import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve o id da `checklist_assumptions` (sessão de execução do dia) à qual uma nova
 * `task_executions` deve ser vinculada via `checklist_assumption_id`.
 *
 * Este vínculo é a forma canônica usada pela Auditoria/PDF/relatórios para localizar o
 * detalhamento de uma execução. Antes, o vínculo era inferido por janela temporal
 * (`checklist_id, user_id, executed_at ∈ [assumed_at, completed_at]`), o que é frágil quando
 * há múltiplas assumptions no mesmo dia. Preencher a coluna na criação torna a associação
 * explícita e estável ao longo do tempo.
 *
 * Estratégia: a assumption do dia sempre é criada ANTES das tarefas serem executadas
 * (o usuário assume a rotina primeiro). Preferimos a assumption ainda em aberto
 * (`completed_at IS NULL`) mais recente; se não houver (ex.: rotina já finalizada e o usuário
 * refez uma tarefa), caímos para a assumption mais recente do checklist. Retorna `null` quando
 * não há nenhuma — nesse caso a Auditoria ainda consegue casar pela janela temporal (fallback).
 *
 * Funciona tanto com o client do browser quanto com o admin (mesma API supabase-js).
 */
export async function resolveAssumptionId(
    supabase: SupabaseClient,
    params: { checklistId: string; restaurantId: string },
): Promise<string | null> {
    const { checklistId, restaurantId } = params;

    // 1) Assumption ainda em aberto (sessão ativa) — caso normal.
    const { data: open } = await supabase
        .from('checklist_assumptions')
        .select('id')
        .eq('checklist_id', checklistId)
        .eq('restaurant_id', restaurantId)
        .is('completed_at', null)
        .order('assumed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (open?.id) return open.id;

    // 2) Fallback: assumption mais recente do checklist (rotina já finalizada e refazendo task).
    const { data: latest } = await supabase
        .from('checklist_assumptions')
        .select('id')
        .eq('checklist_id', checklistId)
        .eq('restaurant_id', restaurantId)
        .order('assumed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    return latest?.id ?? null;
}
