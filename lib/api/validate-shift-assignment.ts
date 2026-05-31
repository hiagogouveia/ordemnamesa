import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mensagem de negócio para atribuição inválida por turno.
 */
export const SHIFT_ASSIGNMENT_ERROR =
    'Não é possível atribuir esta rotina ao colaborador porque ele não pertence ao turno da rotina.';

/**
 * Sprint 66 — Valida que, em ATRIBUIÇÃO DIRETA a um colaborador específico com
 * TURNO definido, o colaborador pertence àquele turno (tem vínculo em user_shifts).
 *
 * Regra (igual frontend):
 *  - sem atribuição direta (assignedToUserId nulo) → não valida (toda a área).
 *  - turno = "Todos os turnos" (shiftId nulo) → não valida.
 *  - caso contrário → exige vínculo user_shifts(restaurant_id, user_id, shift_id).
 *
 * Retorna `null` quando ok, ou a mensagem de erro de negócio quando inválido.
 */
export async function validateShiftAssignment(
    supabase: SupabaseClient,
    restaurantId: string,
    assignedToUserId: string | null | undefined,
    shiftId: string | null | undefined,
): Promise<string | null> {
    if (!assignedToUserId || !shiftId) return null;

    const { data } = await supabase
        .from('user_shifts')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', assignedToUserId)
        .eq('shift_id', shiftId)
        .maybeSingle();

    return data ? null : SHIFT_ASSIGNMENT_ERROR;
}
