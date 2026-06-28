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
 * 1. Foi diretamente atribuído a ele (assigned_to_user_id / responsible.id)
 * 2. É distribuído por área (sem atribuição direta) E:
 *    a. Ninguém assumiu ainda (disponível para o colaborador)
 *    b. O próprio colaborador assumiu
 *
 * Checklists de área já assumidos por OUTRO colaborador são excluídos.
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

    return checklists.filter((c) => {
        // 1. Diretamente atribuído ao colaborador
        const directlyAssigned = c.responsible?.id === collaboratorId
            || c.assigned_to_user_id === collaboratorId;

        // "Apenas atribuídas ao colaborador": só responsabilidades individuais
        if (origin === 'direct') return directlyAssigned;

        // Rotinas diretas só aparecem em 'all' (em 'area' são excluídas)
        if (directlyAssigned) return origin === 'all';

        // 2. Global (sem área e sem atribuição direta) — visível para todos
        const isGlobal = !c.assigned_to_user_id && !c.area_id;
        if (isGlobal) {
            // Globais nunca contam como "atribuídas à área"
            if (origin === 'area') return false;
            if (!c.assumed_by_user_id) return true;
            if (c.assumed_by_user_id === collaboratorId) return true;
            return false;
        }

        // 3. Distribuído por área (sem atribuição direta)
        const isAreaDistributed = !c.assigned_to_user_id
            && !!c.area_id
            && collaboratorAreaIds.has(c.area_id);

        if (!isAreaDistributed) return false;

        // Se ninguém assumiu, está disponível para o colaborador
        if (!c.assumed_by_user_id) return true;

        // Se o próprio colaborador assumiu, mostrar
        if (c.assumed_by_user_id === collaboratorId) return true;

        // Outro colaborador assumiu — excluir
        return false;
    });
}
