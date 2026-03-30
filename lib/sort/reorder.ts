import type { ChecklistOrder } from "@/lib/types";

const VALID_SHIFTS = ["morning", "afternoon", "evening"] as const;
type ValidShift = (typeof VALID_SHIFTS)[number];

interface SortableItem {
    id: string;
    shift: string;
}

/**
 * Produces updated ChecklistOrder records from a reordered flat list.
 * Groups by shift and assigns positions 0, 1, 2... within each shift group.
 * Items with shift "any" are excluded — they have no entry in checklist_orders.
 */
export function buildOrdersFromList(
    orderedItems: SortableItem[],
    restaurantId: string,
    existingOrders: ChecklistOrder[]
): ChecklistOrder[] {
    const result: ChecklistOrder[] = [];

    for (const shift of VALID_SHIFTS) {
        const shiftItems = orderedItems.filter(
            (item): item is SortableItem & { shift: ValidShift } => item.shift === shift
        );

        shiftItems.forEach((item, index) => {
            const existing = existingOrders.find(
                (o) => o.checklist_id === item.id && o.shift === shift
            );
            result.push({
                id: existing?.id ?? `temp-${item.id}-${shift}`,
                restaurant_id: restaurantId,
                checklist_id: item.id,
                shift,
                position: index,
            });
        });
    }

    return result;
}
