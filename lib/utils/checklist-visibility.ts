/**
 * Predicado puro de **visibilidade operacional** de checklist.
 *
 * Decisão de produto: contexto operacional (Meu Turno, recebimentos, kanban)
 * NÃO tem bypass para owner/manager. Todos os usuários — incluindo gestores —
 * só veem rotinas que realmente executariam, com base em:
 *   1. (áreas da rotina ∩ áreas do user ≠ ∅) AND sem responsável AND role_id IS NULL → distribuição por área
 *   2. (interseção de áreas) AND role_id ∈ roles do user AND sem responsável        → distribuição por cargo
 *   3. (interseção de áreas) AND user.id ∈ responsáveis da rotina                   → atribuição individual
 *
 * Se o gestor quer ver áreas extras, deve ser vinculado a elas em user_areas.
 *
 * Sprint 92 — a rotina passou a ter 1..N áreas (`checklist_areas`) e 0..N
 * responsáveis específicos (`checklist_responsibles`). A regra de igualdade virou
 * **interseção**; a ordem das checagens é a mesma de antes, então um responsável
 * específico continua precisando pertencer a alguma das áreas da rotina.
 * `area_id` / `assigned_to_user_id` seguem aceitos como *fallback* (sombras
 * derivadas) para chamadores que ainda não carregam as listas.
 *
 * Contextos administrativos (/checklists, /admin/*, relatórios) NÃO usam este
 * predicado — lá owner/manager continuam vendo tudo do tenant.
 *
 * Centralizar aqui evita divergência entre os endpoints operacionais, que antes
 * remontavam o mesmo filtro à mão em strings `.or()` do PostgREST.
 */

export interface VisibilityContext {
    userId: string;
    /** IDs das áreas do usuário no restaurante (user_areas). */
    areaIds: string[];
    /** IDs dos cargos do usuário no restaurante (user_roles). */
    roleIds: string[];
}

export interface VisibilityChecklist {
    /** Áreas da rotina (s92, fonte da verdade). */
    area_ids?: string[] | null;
    /** Responsáveis específicos da rotina (s92, fonte da verdade). Vazio = distribuição por área. */
    responsible_user_ids?: string[] | null;
    role_id?: string | null;
    /** DEPRECADO (sombra). Usado só quando `area_ids` não vem carregado. */
    area_id?: string | null;
    /** DEPRECADO (sombra). Usado só quando `responsible_user_ids` não vem carregado. */
    assigned_to_user_id?: string | null;
}

/** Áreas efetivas da rotina, com fallback para a sombra `area_id`. */
export function resolveAreaIds(c: VisibilityChecklist): string[] {
    if (c.area_ids && c.area_ids.length > 0) return c.area_ids;
    return c.area_id ? [c.area_id] : [];
}

/** Responsáveis efetivos da rotina, com fallback para a sombra `assigned_to_user_id`. */
export function resolveResponsibleIds(c: VisibilityChecklist): string[] {
    if (c.responsible_user_ids && c.responsible_user_ids.length > 0) return c.responsible_user_ids;
    return c.assigned_to_user_id ? [c.assigned_to_user_id] : [];
}

export function canExecuteChecklist(
    c: VisibilityChecklist,
    ctx: VisibilityContext,
): boolean {
    const areaIds = resolveAreaIds(c);

    // Invariante: sem área = não executável.
    if (areaIds.length === 0) return false;

    // Interseção com as áreas do usuário (antes era igualdade com a área única).
    const userAreas = new Set(ctx.areaIds);
    if (!areaIds.some((id) => userAreas.has(id))) return false;

    // Atribuição individual tem precedência absoluta.
    const responsibles = resolveResponsibleIds(c);
    if (responsibles.length > 0) {
        return responsibles.includes(ctx.userId);
    }

    // Sem atribuição individual: se tem cargo, exige cargo.
    if (c.role_id) {
        return ctx.roleIds.includes(c.role_id);
    }

    // Distribuição por área (interseção já validada acima).
    return true;
}
