import type { SupabaseClient } from '@supabase/supabase-js';
import { canExecuteChecklist, type VisibilityContext } from '@/lib/utils/checklist-visibility';

/**
 * Sprint 92 — Helpers do modelo N:N rotina/modelo ↔ áreas e ↔ responsáveis.
 *
 * Espelha `lib/api/shift-links.ts`. As tabelas de junção são a FONTE DA VERDADE;
 * `area_id` / `assigned_to_user_id` nas linhas de `checklists` / `receiving_templates`
 * são sombras derivadas mantidas por trigger no banco — nunca escreva nelas
 * esperando que valham como configuração.
 */

/** O cliente JS do Supabase trunca em 1000 linhas; paginamos explicitamente. */
const PAGE_SIZE = 1000;

async function fetchMap(
    supabase: SupabaseClient,
    table: string,
    fkColumn: string,
    valueColumn: string,
    ids: string[],
): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;

    // Fatiar os ids também mantém a URL do PostgREST em tamanho sadio.
    for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        let from = 0;
        for (;;) {
            const { data } = await supabase
                .from(table)
                .select(`${fkColumn}, ${valueColumn}`)
                .in(fkColumn, chunk)
                .range(from, from + PAGE_SIZE - 1);
            const rows = (data ?? []) as unknown as Array<Record<string, string>>;
            for (const row of rows) {
                const key = row[fkColumn];
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(row[valueColumn]);
            }
            if (rows.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }
    }
    return map;
}

/** Map checklist_id → area_id[]. Vazio = rotina não executável. */
export function fetchAreaIdsByChecklist(supabase: SupabaseClient, checklistIds: string[]) {
    return fetchMap(supabase, 'checklist_areas', 'checklist_id', 'area_id', checklistIds);
}

/** Map template_id → area_id[]. */
export function fetchAreaIdsByTemplate(supabase: SupabaseClient, templateIds: string[]) {
    return fetchMap(supabase, 'receiving_template_areas', 'template_id', 'area_id', templateIds);
}

/** Map checklist_id → user_id[] dos responsáveis específicos. */
export function fetchResponsibleIdsByChecklist(supabase: SupabaseClient, checklistIds: string[]) {
    return fetchMap(supabase, 'checklist_responsibles', 'checklist_id', 'user_id', checklistIds);
}

/** Map template_id → user_id[] dos responsáveis específicos. */
export function fetchResponsibleIdsByTemplate(supabase: SupabaseClient, templateIds: string[]) {
    return fetchMap(supabase, 'receiving_template_responsibles', 'template_id', 'user_id', templateIds);
}

async function replaceLinks(
    supabase: SupabaseClient,
    table: string,
    fkColumn: string,
    valueColumn: string,
    restaurantId: string,
    parentId: string,
    values: string[],
): Promise<void> {
    await supabase.from(table).delete().eq(fkColumn, parentId);
    if (values.length > 0) {
        await supabase.from(table).insert(
            values.map((v) => ({ restaurant_id: restaurantId, [fkColumn]: parentId, [valueColumn]: v })),
        );
    }
}

/** Substitui (delete+insert) as áreas N:N de uma rotina. */
export function replaceChecklistAreas(
    supabase: SupabaseClient, restaurantId: string, checklistId: string, areaIds: string[],
) {
    return replaceLinks(supabase, 'checklist_areas', 'checklist_id', 'area_id', restaurantId, checklistId, areaIds);
}

/** Substitui (delete+insert) os responsáveis N:N de uma rotina. */
export function replaceChecklistResponsibles(
    supabase: SupabaseClient, restaurantId: string, checklistId: string, userIds: string[],
) {
    return replaceLinks(supabase, 'checklist_responsibles', 'checklist_id', 'user_id', restaurantId, checklistId, userIds);
}

/** Substitui (delete+insert) as áreas N:N de um modelo de recebimento. */
export function replaceTemplateAreas(
    supabase: SupabaseClient, restaurantId: string, templateId: string, areaIds: string[],
) {
    return replaceLinks(supabase, 'receiving_template_areas', 'template_id', 'area_id', restaurantId, templateId, areaIds);
}

/** Substitui (delete+insert) os responsáveis N:N de um modelo de recebimento. */
export function replaceTemplateResponsibles(
    supabase: SupabaseClient, restaurantId: string, templateId: string, userIds: string[],
) {
    return replaceLinks(supabase, 'receiving_template_responsibles', 'template_id', 'user_id', restaurantId, templateId, userIds);
}

/** Normaliza um valor recebido do cliente para string[] de ids (dedup, sem vazios). */
export function normalizeIdList(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

/**
 * Lê `area_ids` do body aceitando o formato legado (`area_id` único).
 * Devolve `null` quando o cliente não enviou nenhum dos dois — o caller usa isso
 * para NÃO mexer nas junções existentes (mesma proteção do `safeAreaId` no PUT).
 */
export function readAreaIdsFromBody(body: Record<string, unknown>): string[] | null {
    if ('area_ids' in body) return normalizeIdList(body.area_ids);
    if ('area_id' in body) {
        const single = body.area_id;
        return typeof single === 'string' && single ? [single] : [];
    }
    return null;
}

/** Idem para responsáveis específicos (`responsible_user_ids` / `assigned_to_user_id`). */
export function readResponsibleIdsFromBody(body: Record<string, unknown>): string[] | null {
    if ('responsible_user_ids' in body) return normalizeIdList(body.responsible_user_ids);
    if ('assigned_to_user_id' in body) {
        const single = body.assigned_to_user_id;
        return typeof single === 'string' && single ? [single] : [];
    }
    return null;
}

/** Rotina enriquecida com os vínculos N:N resolvidos. */
export type WithAreaLinks<T> = T & { area_ids: string[]; responsible_user_ids: string[] };

/**
 * Anexa `area_ids` / `responsible_user_ids` às rotinas e mantém só as que o usuário
 * pode executar, segundo `canExecuteChecklist` — a fonte única do predicado.
 *
 * Substitui as strings `.or()` que os endpoints operacionais montavam à mão sobre
 * `area_id`. O caller deve ter buscado um SUPERCONJUNTO (tipicamente via embed
 * `checklist_areas!inner` filtrado pelas áreas do usuário).
 */
export async function filterExecutable<T extends { id: string }>(
    supabase: SupabaseClient,
    rows: T[],
    ctx: VisibilityContext,
): Promise<WithAreaLinks<T>[]> {
    const enriched = await attachAreaLinks(supabase, rows);
    return enriched.filter((row) => canExecuteChecklist(row, ctx));
}

/** Só anexa os vínculos N:N, sem filtrar (para telas que já resolveram o escopo). */
export async function attachAreaLinks<T extends { id: string }>(
    supabase: SupabaseClient,
    rows: T[],
): Promise<WithAreaLinks<T>[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [areaMap, responsibleMap] = await Promise.all([
        fetchAreaIdsByChecklist(supabase, ids),
        fetchResponsibleIdsByChecklist(supabase, ids),
    ]);
    return rows.map((row) => ({
        ...row,
        area_ids: areaMap.get(row.id) ?? [],
        responsible_user_ids: responsibleMap.get(row.id) ?? [],
    }));
}

/**
 * Valida a regra de domínio "todo responsável específico pertence a alguma das
 * áreas selecionadas". Substitui a checagem única de `user_areas` que existia no
 * POST/PUT de rotinas. Devolve a mensagem de erro ou `null` se estiver tudo certo.
 */
export async function validateResponsiblesBelongToAreas(
    supabase: SupabaseClient,
    restaurantId: string,
    userIds: string[],
    areaIds: string[],
): Promise<string | null> {
    if (userIds.length === 0 || areaIds.length === 0) return null;

    const { data } = await supabase
        .from('user_areas')
        .select('user_id')
        .eq('restaurant_id', restaurantId)
        .in('user_id', userIds)
        .in('area_id', areaIds);

    const ok = new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
    const invalid = userIds.filter((id) => !ok.has(id));
    if (invalid.length === 0) return null;

    return invalid.length === 1
        ? 'O colaborador selecionado não pertence a nenhuma das áreas escolhidas.'
        : `${invalid.length} colaboradores selecionados não pertencem a nenhuma das áreas escolhidas.`;
}
