import type { Area, ReceivingTemplate } from '@/lib/types';

/**
 * Sprint 92 — forma única do modelo de recebimento devolvido pelas APIs.
 *
 * Existe pelo mesmo motivo do `checklist-view.ts`: GET da lista, POST, PUT e
 * `/available` devolviam o mesmo recurso com selects diferentes, e o cliente
 * escreve a resposta direto no cache. Se um relacionamento novo aparece na UI,
 * ele entra AQUI e os quatro endpoints ganham juntos.
 */

/** Relacionamentos embedados. `area`/`assigned_to_user_id` são sombras legadas. */
export const RECEIVING_TEMPLATE_SELECT = `
    *,
    area:areas!area_id ( id, name, color ),
    role:roles ( id, name, color ),
    template_areas:receiving_template_areas ( area_id, areas ( id, name, color ) ),
    template_responsibles:receiving_template_responsibles ( user_id, users ( id, name ) )
`;

interface TemplateLinkRow {
    template_areas?: Array<{ area_id: string; areas: Area | null }>;
    template_responsibles?: Array<{ user_id: string; users: { id: string; name: string } | null }>;
    [key: string]: unknown;
}

/** Achata as junções em `area_ids`/`areas_list`/`responsible_user_ids`/`responsibles`. */
export function shapeTemplateRow<T extends TemplateLinkRow>(row: T): ReceivingTemplate {
    const areaLinks = (row.template_areas ?? [])
        .filter((l) => Boolean(l.areas))
        .sort((a, b) => a.areas!.name.localeCompare(b.areas!.name));
    const responsibleLinks = (row.template_responsibles ?? [])
        .filter((l) => Boolean(l.users))
        .sort((a, b) => (a.users!.name ?? '').localeCompare(b.users!.name ?? ''));

    return {
        ...row,
        template_areas: undefined,
        template_responsibles: undefined,
        area_ids: areaLinks.map((l) => l.area_id),
        areas_list: areaLinks.map((l) => l.areas!),
        responsible_user_ids: responsibleLinks.map((l) => l.user_id),
        responsibles: responsibleLinks.map((l) => l.users!),
    } as unknown as ReceivingTemplate;
}

export function shapeTemplateRows<T extends TemplateLinkRow>(rows: T[]): ReceivingTemplate[] {
    return rows.map(shapeTemplateRow);
}
