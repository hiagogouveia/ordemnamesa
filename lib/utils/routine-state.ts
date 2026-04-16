import { ChecklistPriorityLevel, getChecklistPriority } from "./checklist-priority";

export type RoutineStateKind =
    | "available"
    | "future"
    | "doing"
    | "late"
    | "blocked";

export interface RoutineStateInfo {
    kind: RoutineStateKind;
    /** Alguém já está executando (usado em conjunto com kind='late'). */
    inProgress: boolean;
}

export interface RoutineStateInput {
    start_time?: string | null;
    end_time?: string | null;
    currentMinutes: number;
    /** Se a rotina tem ao menos uma tarefa com status 'blocked'. */
    hasBlockedTask?: boolean;
    /** Se a rotina tem execução em andamento (doing/done/flagged). */
    hasInProgressExecution?: boolean;
}

/**
 * Estado operacional consolidado da rotina, com precedência:
 *   Impedimento > Atrasada > Em execução > Disponível (Futura é uma sub-variante atenuada).
 */
export function getRoutineState(input: RoutineStateInput): RoutineStateInfo {
    const { start_time, end_time, currentMinutes, hasBlockedTask, hasInProgressExecution } = input;

    if (hasBlockedTask) {
        return { kind: "blocked", inProgress: Boolean(hasInProgressExecution) };
    }

    const priority = getChecklistPriority({ start_time: start_time || undefined, end_time: end_time || undefined }, currentMinutes);
    const isLate = priority === ChecklistPriorityLevel.LATE;
    const isFuture = priority === ChecklistPriorityLevel.FUTURE;

    if (isLate) {
        return { kind: "late", inProgress: Boolean(hasInProgressExecution) };
    }

    if (hasInProgressExecution) {
        return { kind: "doing", inProgress: true };
    }

    if (isFuture) {
        return { kind: "future", inProgress: false };
    }

    return { kind: "available", inProgress: false };
}
