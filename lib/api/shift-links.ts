import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sprint 66 — Helpers do modelo N:N rotina/modelo ↔ turnos.
 */

async function fetchMap(
    supabase: SupabaseClient,
    table: 'checklist_shifts' | 'receiving_template_shifts',
    fkColumn: 'checklist_id' | 'template_id',
    ids: string[],
): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;
    const { data } = await supabase
        .from(table)
        .select(`${fkColumn}, shift_id`)
        .in(fkColumn, ids);
    for (const row of (data ?? []) as Array<Record<string, string>>) {
        const key = row[fkColumn];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row.shift_id);
    }
    return map;
}

/** Map checklist_id → shift_id[] (vazio/ausente = "Todos os turnos"). */
export function fetchShiftIdsByChecklist(supabase: SupabaseClient, checklistIds: string[]) {
    return fetchMap(supabase, 'checklist_shifts', 'checklist_id', checklistIds);
}

/** Map template_id → shift_id[] (vazio/ausente = "Todos os turnos"). */
export function fetchShiftIdsByTemplate(supabase: SupabaseClient, templateIds: string[]) {
    return fetchMap(supabase, 'receiving_template_shifts', 'template_id', templateIds);
}

/** Shadow single: shift_id só quando há exatamente 1 turno; senão null. */
export function shiftIdShadow(shiftIds: string[]): string | null {
    return shiftIds.length === 1 ? shiftIds[0] : null;
}

/** Substitui (delete+insert) os turnos N:N de uma rotina. */
export async function replaceChecklistShifts(
    supabase: SupabaseClient,
    restaurantId: string,
    checklistId: string,
    shiftIds: string[],
): Promise<void> {
    await supabase.from('checklist_shifts').delete().eq('checklist_id', checklistId);
    if (shiftIds.length > 0) {
        await supabase.from('checklist_shifts').insert(
            shiftIds.map((sid) => ({ restaurant_id: restaurantId, checklist_id: checklistId, shift_id: sid })),
        );
    }
}

/** Substitui (delete+insert) os turnos N:N de um modelo de recebimento. */
export async function replaceTemplateShifts(
    supabase: SupabaseClient,
    restaurantId: string,
    templateId: string,
    shiftIds: string[],
): Promise<void> {
    await supabase.from('receiving_template_shifts').delete().eq('template_id', templateId);
    if (shiftIds.length > 0) {
        await supabase.from('receiving_template_shifts').insert(
            shiftIds.map((sid) => ({ restaurant_id: restaurantId, template_id: templateId, shift_id: sid })),
        );
    }
}

/** Normaliza um valor recebido do cliente para string[] de shift_ids (dedup). */
export function normalizeShiftIds(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

/**
 * Predicado de visibilidade por turno (interseção), com prioridade da atribuição direta.
 * Pré-condição do caller: só aplicar quando o usuário possui turnos vinculados
 * (sem turno → vê tudo). Aqui assume-se que o filtro está ativo.
 *
 *  - atribuição direta ao usuário        → sempre visível
 *  - conjunto de turnos da rotina vazio  → "Todos os turnos" → visível
 *  - interseção rotina ∩ usuário ≠ ∅      → visível
 *  - caso contrário                       → oculto
 */
export function isVisibleByShiftIntersection(
    routineShiftIds: string[],
    userShiftIds: string[],
    /** s92: aceita a lista de responsáveis (N:N) ou a sombra única. */
    assignedToUserId: string | string[] | null | undefined,
    userId: string,
): boolean {
    const assigned = Array.isArray(assignedToUserId)
        ? assignedToUserId
        : (assignedToUserId ? [assignedToUserId] : []);
    if (assigned.includes(userId)) return true;
    if (routineShiftIds.length === 0) return true;
    const userSet = new Set(userShiftIds);
    return routineShiftIds.some((id) => userSet.has(id));
}
