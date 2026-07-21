import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchShiftIdsByChecklist } from '@/lib/api/shift-links';
import { validateShiftAssignment, SHIFT_ASSIGNMENT_ERROR } from '@/lib/api/validate-shift-assignment';
import { validateResponsiblesBelongToAreas } from '@/lib/api/area-links';

/**
 * Sprint 94 — Regras de ELEGIBILIDADE do colaborador de destino de uma transferência.
 *
 * Extraído de `POST /api/checklists/transfer-responsible` (transferência permanente),
 * que agora chama esta função em vez de manter a validação inline. A transferência
 * TEMPORÁRIA usa exatamente a mesma — e é esse compartilhamento que garante a
 * exigência do produto: "respeitar exatamente as mesmas regras atuais de atribuição".
 * Duas cópias divergiriam na primeira vez que uma das regras mudasse.
 *
 * As três regras, na ordem em que erram na prática:
 *   1. destino ativo na unidade      (restaurant_users.active)
 *   2. destino pertence a ALGUMA das áreas da rotina (user_areas)
 *   3. destino cobre o turno de CADA rotina          (user_shifts ∩ checklist_shifts)
 *
 * `null` = elegível. Caso contrário, um objeto pronto para virar resposta HTTP.
 */

export interface TransferTargetError {
    error: string;
    /** Presente só no erro de turno — a UI lista as rotinas bloqueadas. */
    code?: 'SHIFT_ASSIGNMENT_INVALID';
    blocked_routines?: string[];
}

export interface ValidateTransferTargetInput {
    restaurantId: string;
    /** Colaborador que vai RECEBER as rotinas. */
    toUserId: string;
    /** Rotinas alvo — o nome é usado para listar as bloqueadas por turno. */
    routines: Array<{ id: string; name: string }>;
    /** Áreas da rotina (união), já resolvidas pelo caller via `fetchAreaIdsByChecklist`. */
    areaIds: string[];
}

export async function validateTransferTarget(
    supabase: SupabaseClient,
    input: ValidateTransferTargetInput,
): Promise<TransferTargetError | null> {
    const { restaurantId, toUserId, routines, areaIds } = input;

    // 1. Destino ativo na unidade.
    const { data: destMember } = await supabase
        .from('restaurant_users')
        .select('role, active')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', toUserId)
        .eq('active', true)
        .maybeSingle();

    if (!destMember) {
        return { error: 'O colaborador de destino não está ativo nesta unidade.' };
    }

    // 2. Destino pertence a ALGUMA das áreas da rotina.
    const destAreaErr = await validateResponsiblesBelongToAreas(
        supabase, restaurantId, [toUserId], areaIds,
    );
    if (destAreaErr) return { error: destAreaErr };

    // 3. Regra de turno (a mesma da edição): o destino deve cobrir o turno de cada rotina.
    const shiftMap = await fetchShiftIdsByChecklist(supabase, routines.map((r) => r.id));
    const blocked: string[] = [];
    for (const r of routines) {
        const err = await validateShiftAssignment(
            supabase, restaurantId, toUserId, shiftMap.get(r.id) ?? [],
        );
        if (err) blocked.push(r.name);
    }
    if (blocked.length > 0) {
        return {
            error: SHIFT_ASSIGNMENT_ERROR,
            code: 'SHIFT_ASSIGNMENT_INVALID',
            blocked_routines: blocked,
        };
    }

    return null;
}
