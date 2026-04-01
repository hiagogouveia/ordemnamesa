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
 * Filtra checklists por colaborador de forma determinística.
 *
 * Um checklist aparece para o colaborador selecionado se:
 * 1. Foi diretamente atribuído a ele (assigned_to_user_id / responsible.id)
 * 2. É distribuído por área (sem atribuição direta) E:
 *    a. Ninguém assumiu ainda (disponível para o colaborador)
 *    b. O próprio colaborador assumiu
 *
 * Checklists de área já assumidos por OUTRO colaborador são excluídos.
 */
export function filterChecklistsByCollaborator(
    checklists: Checklist[],
    collaboratorId: string,
    collaborators: CollaboratorInfo[]
): Checklist[] {
    if (!collaboratorId) return checklists;

    const collaborator = collaborators.find((m) => m.user_id === collaboratorId);
    if (!collaborator) return [];

    const collaboratorAreaIds = new Set(collaborator.areas.map((a) => a.id));

    return checklists.filter((c) => {
        // 1. Diretamente atribuído ao colaborador
        const directlyAssigned = c.responsible?.id === collaboratorId
            || c.assigned_to_user_id === collaboratorId;

        if (directlyAssigned) return true;

        // 2. Distribuído por área (sem atribuição direta)
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
