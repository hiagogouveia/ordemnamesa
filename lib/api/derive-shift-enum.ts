import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShiftType } from '@/lib/types';

/**
 * Sprint 61 — Deriva a coluna enum legada `checklists.shift` a partir do turno
 * cadastrado (`shifts.id`).
 *
 * O enum permanece como sombra de compatibilidade (relatórios, checklist_orders,
 * ordenação/labels do board, receiving). A fonte da verdade é o `shift_id`; este
 * helper garante que o enum nunca fique divergente do turno escolhido.
 *
 * Regras:
 *  - shift_id NULL/ausente            -> 'any' ("Todos os turnos")
 *  - shift_type do turno é válido     -> usa ('morning' | 'afternoon' | 'evening')
 *  - turno sem shift_type definido    -> 'any' (degrada para "qualquer", nunca oculta)
 */
export async function deriveShiftEnum(
    supabase: SupabaseClient,
    restaurantId: string,
    shiftId: string | null | undefined,
): Promise<ShiftType> {
    if (!shiftId) return 'any';

    const { data } = await supabase
        .from('shifts')
        .select('shift_type')
        .eq('id', shiftId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle<{ shift_type: string | null }>();

    const st = data?.shift_type;
    if (st === 'morning' || st === 'afternoon' || st === 'evening') return st;
    return 'any';
}
