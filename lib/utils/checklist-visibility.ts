/**
 * Predicado puro de **visibilidade operacional** de checklist.
 *
 * Decisão de produto: contexto operacional (Meu Turno, recebimentos, kanban)
 * NÃO tem bypass para owner/manager. Todos os usuários — incluindo gestores —
 * só veem rotinas que realmente executariam, com base em:
 *   1. (area_id ∈ áreas do user) AND assigned_to_user_id IS NULL AND role_id IS NULL → distribuição por área
 *   2. (area_id ∈ áreas) AND role_id ∈ roles do user AND assigned_to_user_id IS NULL → distribuição por cargo
 *   3. (area_id ∈ áreas) AND assigned_to_user_id = user.id                           → atribuição individual
 *
 * Se o gestor quer ver áreas extras, deve ser vinculado a elas em user_areas.
 *
 * Contextos administrativos (/checklists, /admin/*, relatórios) NÃO usam este
 * predicado — lá owner/manager continuam vendo tudo do tenant.
 *
 * Centralizar aqui evita divergência entre kanban (server-side OR string) e
 * endpoints que filtram post-query (Supabase REST não suporta .or() em
 * coluna de relação aninhada de forma confiável).
 */

export interface VisibilityContext {
    userId: string;
    /** IDs das áreas do usuário no restaurante (user_areas). */
    areaIds: string[];
    /** IDs dos cargos do usuário no restaurante (user_roles). */
    roleIds: string[];
}

export interface VisibilityChecklist {
    area_id: string | null;
    assigned_to_user_id?: string | null;
    role_id?: string | null;
}

export function canExecuteChecklist(
    c: VisibilityChecklist,
    ctx: VisibilityContext,
): boolean {
    // Invariante: sem área = não executável.
    if (!c.area_id || !ctx.areaIds.includes(c.area_id)) return false;

    // Atribuição individual tem precedência absoluta.
    if (c.assigned_to_user_id) {
        return c.assigned_to_user_id === ctx.userId;
    }

    // Sem atribuição individual: se tem cargo, exige cargo.
    if (c.role_id) {
        return ctx.roleIds.includes(c.role_id);
    }

    // Distribuição por área (área já validada acima).
    return true;
}
