import type { ExecutionStatus, RecurrenceConfig, RecurrenceV2 } from "@/lib/types";
import { shouldChecklistAppearToday } from "./should-checklist-appear-today";

interface ChecklistForStatus {
    area_id?: string | null;
    active?: boolean;
    execution_status?: ExecutionStatus;
    end_time?: string | null;
    // Sprint 73 — campos de recorrência para a gate de "devida hoje".
    recurrence?: string | null;
    recurrence_config?: RecurrenceConfig | RecurrenceV2 | null;
    shift?: string | null;
    shift_id?: string | null;
    shift_ids?: string[] | null;
}

interface ShiftForStatus {
    id?: string;
    shift_type?: string | null;
    days_of_week: number[];
}

/**
 * Sprint 73 — Contexto operacional ("agora" no fuso do restaurante) para
 * decidir se a rotina é DEVIDA hoje. Sem contexto → assume devida (compat).
 */
export interface StatusContext {
    dayOfWeek: number;   // 0=Dom .. 6=Sab no fuso do restaurante
    dateKey: string;     // YYYY-MM-DD no fuso do restaurante
    shifts?: ShiftForStatus[];
}

/**
 * Função central de domínio: calcula o status operacional real de uma rotina.
 *
 * Ordem de prioridade:
 * 1. Sem área → incomplete (não executável)
 * 2. Status vindo da API (assumption) → respeitar (done)
 * 3. Overdue → SOMENTE se a rotina é DEVIDA HOJE (recorrência válida) e o
 *    horário-limite (end_time) já passou no fuso do restaurante.
 * 4. Fallback → status da API (not_started/in_progress/blocked)
 *
 * Sem `statusCtx`, mantém o comportamento legado (dueToday = true) para
 * chamadas que ainda não fornecem o contexto — sem regressão.
 */
export function getOperationalStatus(
    checklist: ChecklistForStatus,
    currentMinutes: number,
    statusCtx?: StatusContext,
): ExecutionStatus {
    // Invariante de domínio: sem área = incompleta
    if (!checklist.area_id) return "incomplete";

    const apiStatus = (checklist.execution_status ?? "not_started") as ExecutionStatus;

    // Se já finalizada, respeitar
    if (apiStatus === "done") return "done";

    // Promoção para overdue baseada em horário — apenas se devida hoje.
    if (checklist.end_time) {
        const dueToday = statusCtx
            ? shouldChecklistAppearToday(checklist, statusCtx.dayOfWeek, statusCtx.dateKey, statusCtx.shifts)
            : true;
        if (dueToday) {
            const [h, m] = checklist.end_time.split(":").map(Number);
            if (currentMinutes > h * 60 + m) return "overdue";
        }
    }

    return apiStatus;
}
