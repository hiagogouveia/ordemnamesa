/**
 * Tipos do módulo de Auditoria Operacional (Relatórios).
 *
 * AuditStatus contém os 3 status oficiais da auditoria — derivados das
 * tasks executadas dentro de uma assumption. Status internos do banco
 * (task_executions.status, checklist_assumptions.execution_status) NUNCA
 * vazam para a UI: sempre mapeados pelo audit-service.
 */

/**
 * Status FINAL da execução exibido na tela (resultado da rotina).
 *
 * Nota semântica: 'impediment' NÃO é mais status final nesta entrega.
 * Rotinas que tiveram impedimento e foram retomadas/concluídas aparecem como
 * 'completed', com a flag `had_impediment` sinalizando o evento histórico
 * (badge secundária na UI). O valor permanece no enum reservado para um
 * futuro fluxo de "encerramento definitivo com impedimento".
 */
export type AuditStatus =
    | 'completed'    // Concluído
    | 'incomplete'   // Incompleto (reservado — fluxo futuro de abandono)
    | 'impediment';  // Reservado — fluxo futuro de encerramento c/ impedimento

/** Status de uma TASK individual no detalhe. */
export type AuditTaskStatus = AuditStatus | 'pending';

export type Shift = 'morning' | 'afternoon' | 'evening';

export type PeriodPreset = 'today' | '7days' | '30days' | 'custom';

export interface AuditFilters {
    start_date: string | null;
    end_date: string | null;
    preset: PeriodPreset;
    search: string;
    area_ids: string[];
    user_ids: string[];
    shifts: Shift[];
    statuses: AuditStatus[];
    page: number;
    limit: number;
}

export interface UnitInfo {
    id: string;
    name: string;
}

export interface AreaInfo {
    id: string;
    name: string;
    color: string | null;
}

export interface UserInfo {
    id: string;
    name: string;
    avatar_url: string | null;
}

/** Contagem de tasks dentro de uma execução. */
export interface TaskCounts {
    total: number;        // tasks definidas no checklist
    completed: number;    // tasks concluídas
    impediment: number;   // tasks com impedimento (blocked ou flagged no banco)
    incomplete: number;   // tasks não executadas (sem registro) ou puladas
}

/** Item da lista — uma linha = uma checklist_assumption FINALIZADA. */
export interface AuditExecution {
    assumption_id: string;
    date_key: string;
    assumed_at: string;
    completed_at: string | null;
    duration_seconds: number | null;
    status: AuditStatus;
    /**
     * Sinalizador histórico independente do status final.
     * `true` quando, na janela da execução, sobreviveu alguma task_execution
     * com status `blocked` ou `flagged` — evidência de que houve impedimento.
     * Para dados anteriores ao uso desta feature, será `false` mesmo em
     * rotinas que passaram por impedimento (o fluxo legado de "resume" apaga
     * a task_execution blocked, perdendo o rastro).
     */
    had_impediment: boolean;
    checklist: {
        id: string;
        name: string;
        shift: Shift | null;
        recurrence: string | null;
    };
    area: AreaInfo | null;
    user: UserInfo;
    task_counts: TaskCounts;
    evidence_count: number;
    unit?: UnitInfo;
}

export interface AuditListResponse {
    entries: AuditExecution[];
    total: number;
    page: number;
    limit: number;
}

/** Evidência fotográfica (signed URL gerado pelo servidor, sob demanda). */
export interface AuditEvidence {
    storage_path: string;
    signed_url: string | null;
}

export interface AuditTaskDetail {
    task_id: string;
    title: string;
    description: string | null;
    is_critical: boolean;
    order: number;
    execution_id: string | null;
    status: AuditTaskStatus;
    observation: string | null;    // observation (s35) || notes (legado)
    impediment_reason: string | null; // blocked_reason quando aplicável
    executed_at: string | null;
    started_at: string | null;
    evidences: AuditEvidence[];     // pode ter 0, 1 ou N fotos
}

export interface AuditExecutionDetail {
    assumption_id: string;
    status: AuditStatus;
    /** Mesmo significado de `AuditExecution.had_impediment`. */
    had_impediment: boolean;
    date_key: string;
    assumed_at: string;
    completed_at: string | null;
    duration_seconds: number | null;
    impediment_reason: string | null;
    checklist: {
        id: string;
        name: string;
        description: string | null;
        shift: Shift | null;
    };
    area: AreaInfo | null;
    user: UserInfo;
    unit?: UnitInfo;
    tasks: AuditTaskDetail[];
}

/** Labels canônicos. */
export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
    completed: 'Concluído',
    incomplete: 'Incompleto',
    impediment: 'Com impedimento',
};

/**
 * Opções OFICIAIS visíveis no filtro de Status do usuário (esta entrega).
 * 'impediment' fica fora — vide JSDoc em `AuditStatus`. Reincluir quando o
 * fluxo de encerramento definitivo com impedimento for implementado.
 */
export const AUDIT_STATUS_OFFICIAL: AuditStatus[] = ['completed', 'incomplete'];

export const AUDIT_TASK_STATUS_LABEL: Record<AuditTaskStatus, string> = {
    completed: 'Concluída',
    incomplete: 'Incompleta',
    impediment: 'Com impedimento',
    pending: 'Não executada',
};

export const SHIFT_LABEL: Record<Shift, string> = {
    morning: 'Manhã',
    afternoon: 'Tarde',
    evening: 'Noite',
};
