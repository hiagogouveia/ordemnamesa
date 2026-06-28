import type { Checklist } from "@/lib/types";
import type { EquipeMember } from "@/lib/hooks/use-equipe";

/**
 * Resultado da análise de elegibilidade de um conjunto de rotinas selecionadas
 * para a transferência de responsável.
 *
 * A transferência só faz sentido quando todas as rotinas selecionadas compartilham
 * o MESMO responsável direto (origem única), a MESMA área e o MESMO restaurante.
 */
export interface DirectAssignmentGroup {
    ok: boolean;
    sourceUserId?: string;
    sourceName?: string;
    areaId?: string;
    restaurantId?: string;
    /** Motivo legível quando `ok` é falso — usado em tooltip/estado desabilitado. */
    reason?: string;
}

/** Campos mínimos necessários para analisar a elegibilidade (subset de Checklist). */
type SelectableChecklist = Pick<
    Checklist,
    "assigned_to_user_id" | "responsible" | "area_id" | "restaurant_id"
>;

/**
 * Analisa a seleção e retorna o grupo de atribuição direta, se houver.
 *
 * `ok = false` (com `reason`) quando: seleção vazia; alguma rotina não é atribuída
 * diretamente (é de área/global); responsáveis diferentes; áreas diferentes; ou
 * restaurantes diferentes.
 */
export function getDirectAssignmentGroup(
    selected: SelectableChecklist[]
): DirectAssignmentGroup {
    if (selected.length === 0) {
        return { ok: false, reason: "Selecione ao menos uma rotina." };
    }

    // Toda rotina precisa ter responsável direto (assigned_to_user_id não-nulo).
    const allDirect = selected.every(
        (c) => !!(c.assigned_to_user_id ?? c.responsible?.id)
    );
    if (!allDirect) {
        return {
            ok: false,
            reason:
                "Apenas rotinas atribuídas diretamente a um colaborador podem ser transferidas.",
        };
    }

    const first = selected[0];
    const sourceUserId = first.assigned_to_user_id ?? first.responsible?.id ?? undefined;
    const areaId = first.area_id ?? undefined;
    const restaurantId = first.restaurant_id;

    if (!sourceUserId || !areaId) {
        return {
            ok: false,
            reason:
                "Apenas rotinas atribuídas diretamente a um colaborador podem ser transferidas.",
        };
    }

    const sameSource = selected.every(
        (c) => (c.assigned_to_user_id ?? c.responsible?.id) === sourceUserId
    );
    if (!sameSource) {
        return {
            ok: false,
            reason: "Selecione rotinas de um único colaborador de origem.",
        };
    }

    const sameArea = selected.every((c) => (c.area_id ?? undefined) === areaId);
    if (!sameArea) {
        return {
            ok: false,
            reason: "Selecione rotinas de uma única área.",
        };
    }

    const sameRestaurant = selected.every((c) => c.restaurant_id === restaurantId);
    if (!sameRestaurant) {
        return {
            ok: false,
            reason: "Selecione rotinas de uma única unidade.",
        };
    }

    return {
        ok: true,
        sourceUserId,
        sourceName: first.responsible?.name ?? undefined,
        areaId,
        restaurantId,
    };
}

/**
 * Colaboradores elegíveis como DESTINO da transferência: ativos, pertencentes à
 * mesma área e diferentes do colaborador de origem.
 */
export function getEligibleTransferTargets(
    equipe: EquipeMember[],
    areaId: string,
    sourceUserId: string
): EquipeMember[] {
    return equipe.filter(
        (m) =>
            m.active &&
            m.user_id !== sourceUserId &&
            m.areas.some((a) => a.id === areaId)
    );
}
