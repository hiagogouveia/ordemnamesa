import { Checklist, ExecutionStatus } from "@/lib/types";

/**
 * Prioridade automática conforme spec:
 * 1. OVERDUE (atrasadas)
 * 2. IN_PROGRESS com deadline
 * 3. NOT_STARTED com deadline próximo
 * 4. NOT_STARTED sem horário
 * 5. Futuras (start_time > now)
 */

type ChecklistWithExec = Partial<Checklist> & {
    execution_status?: ExecutionStatus;
    area_id?: string | null;
};

function parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

function getAutoPriorityBucket(c: ChecklistWithExec, currentMinutes: number): number {
    // 0. Incompleta (sem área) — prioridade mais baixa, não executável
    if (!c.area_id) return 6;

    const start = c.start_time ? parseTimeToMinutes(c.start_time) : null;
    const end = c.end_time ? parseTimeToMinutes(c.end_time) : null;
    const status = c.execution_status ?? "not_started";

    // 1. Overdue: end_time passed and not done
    if (end !== null && currentMinutes > end && status !== "done") {
        return 1;
    }

    // 2. In progress with deadline
    if (status === "in_progress" && end !== null) {
        return 2;
    }

    // 3. Not started with deadline próximo (start_time <= now or no start, but has end_time)
    if (
        (status === "not_started" || status === "blocked") &&
        end !== null &&
        (start === null || currentMinutes >= start)
    ) {
        return 3;
    }

    // 5. Future (start_time > now) — check before bucket 4
    if (start !== null && currentMinutes < start) {
        return 5;
    }

    // 4. No time defined or in_progress without deadline
    return 4;
}

function getAutoPrioritySortKey(c: ChecklistWithExec, currentMinutes: number): number {
    const end = c.end_time ? parseTimeToMinutes(c.end_time) : Infinity;
    const start = c.start_time ? parseTimeToMinutes(c.start_time) : Infinity;
    const bucket = getAutoPriorityBucket(c, currentMinutes);

    switch (bucket) {
        case 1: // overdue: most overdue first (smallest end_time)
            return end;
        case 2: // in_progress with deadline: ending soonest first
            return end;
        case 3: // not_started with deadline: ending soonest first
            return end;
        case 4: // no time
            return 0;
        case 5: // future: starting soonest first
            return start;
        default:
            return 0;
    }
}

/**
 * Sorts checklists by auto-priority and returns new order_index values.
 * Used when the manager clicks "Repriorizar automaticamente".
 */
export function computeAutoOrderIndexes<T extends ChecklistWithExec>(
    checklists: T[],
    currentMinutes: number
): Array<{ id: string; order_index: number }> {
    const sorted = [...checklists].sort((a, b) => {
        const bucketA = getAutoPriorityBucket(a, currentMinutes);
        const bucketB = getAutoPriorityBucket(b, currentMinutes);

        if (bucketA !== bucketB) return bucketA - bucketB;

        const keyA = getAutoPrioritySortKey(a, currentMinutes);
        const keyB = getAutoPrioritySortKey(b, currentMinutes);
        return keyA - keyB;
    });

    return sorted.map((c, index) => ({
        id: c.id!,
        order_index: index,
    }));
}

/**
 * Detects conflicts when the manager manually reorders.
 * Returns a warning message if the new order conflicts with auto-priority logic.
 */
export function detectReorderConflict<T extends ChecklistWithExec>(
    movedItem: T,
    targetIndex: number,
    allItems: T[],
    currentMinutes: number
): string | null {
    const movedBucket = getAutoPriorityBucket(movedItem, currentMinutes);

    // Check items that will be below the moved item
    const itemsAbove = allItems.slice(0, targetIndex);

    for (const item of itemsAbove) {
        const itemBucket = getAutoPriorityBucket(item, currentMinutes);
        // The moved item has LOWER priority (higher bucket number) than items it's placed above
        if (movedBucket > itemBucket) {
            if (movedBucket >= 4 && itemBucket <= 2) {
                return "Você está priorizando manualmente uma atividade que não é considerada urgente pelo sistema.";
            }
            if (itemBucket === 1) {
                return "Existem rotinas atrasadas com prioridade maior segundo o sistema.";
            }
            return "Essa ação sobrescreve a priorização automática baseada em horário.";
        }
    }

    // Check items that will be above the moved item
    const itemsBelow = allItems.slice(targetIndex + 1);

    for (const item of itemsBelow) {
        const itemBucket = getAutoPriorityBucket(item, currentMinutes);
        // The moved item has HIGHER priority (lower bucket number) but placed below
        if (movedBucket < itemBucket) {
            // Moving an urgent item down is less common but still a conflict
            continue; // Usually fine — manager may have reasons
        }
        if (movedBucket > itemBucket) {
            return "Essa ação sobrescreve a priorização automática baseada em horário.";
        }
    }

    return null;
}
