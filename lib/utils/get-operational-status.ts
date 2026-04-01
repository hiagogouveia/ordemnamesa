import type { ExecutionStatus } from "@/lib/types";

interface ChecklistForStatus {
    area_id?: string | null;
    active?: boolean;
    execution_status?: ExecutionStatus;
    end_time?: string | null;
}

/**
 * Função central de domínio: calcula o status operacional real de uma rotina.
 *
 * Invariante: uma rotina sem área (area_id == null) NUNCA é "disponível".
 * Ela é considerada "incomplete" — configuração pendente.
 *
 * Ordem de prioridade:
 * 1. Sem área → incomplete (não executável)
 * 2. Status vindo da API (assumption) → respeitar
 * 3. Overdue (derivado do horário) → promover
 * 4. Fallback → not_started (disponível)
 */
export function getOperationalStatus(
    checklist: ChecklistForStatus,
    currentMinutes: number,
): ExecutionStatus {
    // Invariante de domínio: sem área = incompleta
    if (!checklist.area_id) return "incomplete";

    const apiStatus = (checklist.execution_status ?? "not_started") as ExecutionStatus;

    // Se já finalizada, respeitar
    if (apiStatus === "done") return "done";

    // Promoção para overdue baseada em horário
    if (checklist.end_time) {
        const [h, m] = checklist.end_time.split(":").map(Number);
        if (currentMinutes > h * 60 + m) return "overdue";
    }

    return apiStatus;
}
