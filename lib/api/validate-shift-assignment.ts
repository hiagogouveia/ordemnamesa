import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mensagem de negócio para atribuição inválida por turno.
 */
export const SHIFT_ASSIGNMENT_ERROR =
    'Não é possível atribuir esta rotina ao colaborador porque ele não pertence ao turno da rotina.';

/**
 * Sprint 66 — Valida atribuição direta por INTERSEÇÃO de turnos (modelo N:N).
 * O colaborador deve compartilhar ao menos um turno com a rotina.
 *
 * Regra (igual frontend):
 *  - sem atribuição direta (assignedToUserId nulo) → não valida (toda a área).
 *  - rotina "Todos os turnos" (routineShiftIds vazio) → não valida.
 *  - caso contrário → exige interseção user_shifts ∩ routineShiftIds ≠ ∅.
 *
 * Retorna `null` quando ok, ou a mensagem de erro de negócio quando inválido.
 */
export async function validateShiftAssignment(
    supabase: SupabaseClient,
    restaurantId: string,
    assignedToUserId: string | null | undefined,
    routineShiftIds: string[] | null | undefined,
): Promise<string | null> {
    if (!assignedToUserId) return null;
    if (!routineShiftIds || routineShiftIds.length === 0) return null;

    const { data } = await supabase
        .from('user_shifts')
        .select('shift_id')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', assignedToUserId)
        .in('shift_id', routineShiftIds)
        .limit(1);

    return (data && data.length > 0) ? null : SHIFT_ASSIGNMENT_ERROR;
}

/**
 * Sprint 92 — versão N:N: TODOS os responsáveis precisam compartilhar ao menos um
 * turno com a rotina. Mesmas regras de curto-circuito da versão singular.
 */
export async function validateShiftAssignments(
    supabase: SupabaseClient,
    restaurantId: string,
    userIds: string[],
    routineShiftIds: string[] | null | undefined,
): Promise<string | null> {
    if (userIds.length === 0) return null;
    if (!routineShiftIds || routineShiftIds.length === 0) return null;

    const { data } = await supabase
        .from('user_shifts')
        .select('user_id')
        .eq('restaurant_id', restaurantId)
        .in('user_id', userIds)
        .in('shift_id', routineShiftIds);

    const ok = new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
    return userIds.every((id) => ok.has(id)) ? null : SHIFT_ASSIGNMENT_ERROR;
}
