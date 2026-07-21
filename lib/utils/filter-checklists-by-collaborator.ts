import type { Checklist } from "@/lib/types";

export interface CollaboratorArea {
    id: string;
    name: string;
}

export interface CollaboratorInfo {
    user_id: string;
    areas: CollaboratorArea[];
}

/**
 * Origem da atribuição usada para diferenciar responsabilidades:
 * - 'all':    comportamento padrão (diretas + área + globais)
 * - 'direct': apenas rotinas atribuídas diretamente ao colaborador
 * - 'area':   apenas rotinas distribuídas pela área do colaborador (globais excluídas)
 */
export type AssignmentOrigin = 'all' | 'direct' | 'area';

/**
 * Filtra checklists por colaborador de forma determinística.
 *
 * Um checklist aparece para o colaborador selecionado se:
 * 1. Foi diretamente atribuído a ele (está entre os responsáveis da rotina)
 * 2. É distribuído por área (sem responsáveis) E:
 *    a. Ninguém assumiu ainda (disponível para o colaborador)
 *    b. O próprio colaborador assumiu
 *
 * Checklists de área já assumidos por OUTRO colaborador são excluídos.
 *
 * Sprint 92 — a rotina tem 1..N áreas e 0..N responsáveis: "mesma área" virou
 * INTERSEÇÃO e "atribuído a ele" virou pertinência à lista de responsáveis.
 *
 * O parâmetro `origin` permite restringir o resultado por origem da atribuição
 * (ver {@link AssignmentOrigin}). O padrão 'all' preserva o comportamento original.
 */
export function filterChecklistsByCollaborator(
    checklists: Checklist[],
    collaboratorId: string,
    collaborators: CollaboratorInfo[],
    origin: AssignmentOrigin = 'all'
): Checklist[] {
    if (!collaboratorId) return checklists;

    const collaborator = collaborators.find((m) => m.user_id === collaboratorId);
    if (!collaborator) return [];

    const collaboratorAreaIds = new Set(collaborator.areas.map((a) => a.id));

    /** Áreas efetivas da rotina (N:N, com fallback para a sombra `area_id`). */
    const areasOf = (c: Checklist): string[] => {
        if (c.area_ids && c.area_ids.length > 0) return c.area_ids;
        return c.area_id ? [c.area_id] : [];
    };
    /** Responsáveis efetivos (N:N, com fallback para as sombras). */
    const responsiblesOf = (c: Checklist): string[] => {
        if (c.responsible_user_ids && c.responsible_user_ids.length > 0) return c.responsible_user_ids;
        const single = c.assigned_to_user_id ?? c.responsible?.id;
        return single ? [single] : [];
    };

    return checklists.filter((c) => {
        const responsibles = responsiblesOf(c);
        const areaIds = areasOf(c);

        // 1. Diretamente atribuído ao colaborador
        const directlyAssigned = responsibles.includes(collaboratorId);

        // "Apenas atribuídas ao colaborador": só responsabilidades individuais
        if (origin === 'direct') return directlyAssigned;

        // Rotinas diretas só aparecem em 'all' (em 'area' são excluídas)
        if (directlyAssigned) return origin === 'all';

        // 2. Global (sem área e sem atribuição direta) — visível para todos
        const isGlobal = responsibles.length === 0 && areaIds.length === 0;
        if (isGlobal) {
            // Globais nunca contam como "atribuídas à área"
            if (origin === 'area') return false;
            if (!c.assumed_by_user_id) return true;
            if (c.assumed_by_user_id === collaboratorId) return true;
            return false;
        }

        // 3. Distribuído por área (sem responsáveis) — interseção de áreas
        const isAreaDistributed = responsibles.length === 0
            && areaIds.some((id) => collaboratorAreaIds.has(id));

        if (!isAreaDistributed) return false;

        // Se ninguém assumiu, está disponível para o colaborador
        if (!c.assumed_by_user_id) return true;

        // Se o próprio colaborador assumiu, mostrar
        if (c.assumed_by_user_id === collaboratorId) return true;

        // Outro colaborador assumiu — excluir
        return false;
    });
}
