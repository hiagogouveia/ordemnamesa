import type { Checklist } from "@/lib/types";
import type { EquipeMember } from "@/lib/hooks/use-equipe";

/**
 * Resultado da análise de elegibilidade de um conjunto de rotinas selecionadas
 * para a transferência de responsável.
 *
 * A transferência só faz sentido quando todas as rotinas selecionadas compartilham
 * o MESMO responsável direto (origem única), o MESMO conjunto de áreas e o MESMO
 * restaurante. Sprint 92: com vários responsáveis a origem fica ambígua, então a
 * operação segue restrita a rotinas com exatamente um.
 */
export interface DirectAssignmentGroup {
    ok: boolean;
    sourceUserId?: string;
    sourceName?: string;
    areaIds?: string[];
    restaurantId?: string;
    /** Motivo legível quando `ok` é falso — usado em tooltip/estado desabilitado. */
    reason?: string;
}

/** Campos mínimos necessários para analisar a elegibilidade (subset de Checklist). */
type SelectableChecklist = Pick<
    Checklist,
    "assigned_to_user_id" | "responsible" | "responsible_user_ids" | "area_id" | "area_ids" | "restaurant_id"
>;

/** Responsáveis efetivos: lista N:N quando carregada, senão a sombra única. */
function responsiblesOf(c: SelectableChecklist): string[] {
    if (c.responsible_user_ids && c.responsible_user_ids.length > 0) return c.responsible_user_ids;
    const single = c.assigned_to_user_id ?? c.responsible?.id;
    return single ? [single] : [];
}

/** Chave estável do conjunto de áreas, para comparar seleções. */
function areasKeyOf(c: SelectableChecklist): string {
    const ids = (c.area_ids && c.area_ids.length > 0)
        ? c.area_ids
        : (c.area_id ? [c.area_id] : []);
    return [...ids].sort().join(",");
}

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

    // Toda rotina precisa ter EXATAMENTE UM responsável direto.
    const allDirect = selected.every((c) => responsiblesOf(c).length === 1);
    if (!allDirect) {
        return {
            ok: false,
            reason:
                "Apenas rotinas atribuídas diretamente a um único colaborador podem ser transferidas.",
        };
    }

    const first = selected[0];
    const sourceUserId = responsiblesOf(first)[0];
    const areaIds = (first.area_ids && first.area_ids.length > 0)
        ? first.area_ids
        : (first.area_id ? [first.area_id] : []);
    const restaurantId = first.restaurant_id;

    if (!sourceUserId || areaIds.length === 0) {
        return {
            ok: false,
            reason:
                "Apenas rotinas atribuídas diretamente a um único colaborador podem ser transferidas.",
        };
    }

    const sameSource = selected.every((c) => responsiblesOf(c)[0] === sourceUserId);
    if (!sameSource) {
        return {
            ok: false,
            reason: "Selecione rotinas de um único colaborador de origem.",
        };
    }

    const baseAreasKey = areasKeyOf(first);
    const sameArea = selected.every((c) => areasKeyOf(c) === baseAreasKey);
    if (!sameArea) {
        return {
            ok: false,
            reason: "Selecione rotinas com o mesmo conjunto de áreas.",
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
        areaIds,
        restaurantId,
    };
}

/**
 * Colaboradores elegíveis como DESTINO da transferência: ativos, pertencentes a
 * ALGUMA das áreas da rotina e diferentes do colaborador de origem.
 */
export function getEligibleTransferTargets(
    equipe: EquipeMember[],
    areaIds: string[],
    sourceUserId: string
): EquipeMember[] {
    const wanted = new Set(areaIds);
    return equipe.filter(
        (m) =>
            m.active &&
            m.user_id !== sourceUserId &&
            m.areas.some((a) => wanted.has(a.id))
    );
}
