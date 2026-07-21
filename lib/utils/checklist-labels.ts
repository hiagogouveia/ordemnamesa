import type { Area, Checklist } from "@/lib/types";

/**
 * Sprint 92 — rótulos de exibição de áreas e responsáveis.
 *
 * Existe porque a rotina passou a ter 1..N áreas e 0..N responsáveis, e cada
 * listagem resolvia isso lendo `checklist.area.name` / `checklist.responsible.name`
 * — as SOMBRAS, que com 2+ responsáveis são nulas. Centralizar aqui garante que
 * card, tabela, drawer e painel mostrem a mesma coisa.
 */

type ChecklistLike = Pick<
    Checklist,
    "area" | "area_id" | "areas_list" | "responsible" | "responsibles" | "assigned_to_user_id"
>;

/** Áreas para exibição (N:N com fallback para a sombra). Ordenadas por nome. */
export function displayAreas(c: ChecklistLike): Area[] {
    if (c.areas_list && c.areas_list.length > 0) return c.areas_list;
    return c.area ? [c.area] : [];
}

/** Nomes das áreas separados por vírgula — para `title` e ordenação. */
export function areasLabel(c: ChecklistLike): string {
    return displayAreas(c).map((a) => a.name).join(", ");
}

/** Responsáveis para exibição (N:N com fallback para a sombra). */
export function displayResponsibles(c: ChecklistLike): { id: string; name: string }[] {
    if (c.responsibles && c.responsibles.length > 0) return c.responsibles;
    return c.responsible ? [c.responsible] : [];
}

/**
 * Rótulo curto do responsável para tabelas: um nome, ou "N colaboradores".
 * `null` quando a rotina é distribuída por área (sem responsável específico).
 */
export function responsibleLabel(c: ChecklistLike): string | null {
    const list = displayResponsibles(c);
    if (list.length === 0) return null;
    if (list.length === 1) return list[0].name;
    return `${list.length} colaboradores`;
}

/** Nomes completos dos responsáveis — para `title` (tooltip). */
export function responsiblesTitle(c: ChecklistLike): string {
    return displayResponsibles(c).map((r) => r.name).join(", ");
}
