/**
 * Tipos do módulo de Auditoria Operacional (Relatórios).
 *
 * AuditStatus contém os 3 status oficiais da auditoria — derivados das
 * tasks executadas dentro de uma assumption. Status internos do banco
 * (task_executions.status, checklist_assumptions.execution_status) NUNCA
 * vazam para a UI: sempre mapeados pelo audit-service.
 */
import type { TaskType } from './index';

/**
 * Status FINAL da execução exibido na tela (resultado da rotina).
 *
 * Semântica (Sprint 45 — ocorrências em `task_issues`):
 * - 'completed'  → rotina finalizada. Pode ter `had_impediment=true` quando
 *                  houve ocorrência mas a task afetada foi retomada/concluída.
 * - 'impediment' → rotina finalizada COM ocorrência pendente: existe
 *                  task_issue aberta/investigando cuja task NÃO foi concluída.
 * - 'incomplete' → reservado para fluxo futuro de abandono/não-finalização
 *                  (não atribuído atualmente).
 */
export type AuditStatus =
    | 'completed'
    | 'incomplete'
    | 'impediment';

/**
 * Status de uma TASK individual no detalhe.
 *
 * 'removed' (s88) → a tarefa constava do snapshot da rotina no momento do assume, nunca foi
 * executada, e foi removida da rotina depois. Não é pendência do colaborador: a tarefa deixou de
 * ser exigida. Fica fora da contagem de "não executadas".
 */
export type AuditTaskStatus = AuditStatus | 'pending' | 'removed';

export type Shift = 'morning' | 'afternoon' | 'evening';

export type PeriodPreset = 'today' | '7days' | '30days' | 'custom';

/** Tipo da execução para filtro UI (separa rotinas vs recebimentos). */
export type AuditKind = 'all' | 'routine' | 'receiving';

export interface AuditFilters {
    start_date: string | null;
    end_date: string | null;
    preset: PeriodPreset;
    search: string;
    area_ids: string[];
    user_ids: string[];
    shifts: Shift[];
    statuses: AuditStatus[];
    /** s60: separa Rotinas (regular/opening/closing) de Recebimentos (checklist_type=receiving). */
    kind: AuditKind;
    /** s60: filtro por fornecedor — só aplica quando kind='receiving'. */
    supplier_ids: string[];
    page: number;
    limit: number;
}

export interface SupplierInfo {
    id: string;
    name: string;
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
        /** s60: tipo da rotina (receiving distingue recebimento de rotina regular). */
        checklist_type?: 'regular' | 'opening' | 'closing' | 'receiving' | null;
    };
    /** s92 — DEPRECADO: primeira área. Use `areas` (a rotina pode ter várias). */
    area: AreaInfo | null;
    /** s92 — todas as áreas da rotina, ordenadas por nome. */
    areas: AreaInfo[];
    user: UserInfo;
    /** s60: fornecedor da execução — sempre nulo em rotinas não-recebimento. */
    supplier: SupplierInfo | null;
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
    /** Tipo da tarefa no momento da execução (type_snapshot). */
    task_type: TaskType | null;
    /** Nota 1..5 quando task_type === 'rating'. */
    value_rating: number | null;
    evidences: AuditEvidence[];     // pode ter 0, 1 ou N fotos
}

/** Ocorrência operacional (task_issues) vinculada à execução. */
export interface AuditIssue {
    id: string;
    task_id: string;
    task_title: string;
    description: string;
    photos: AuditEvidence[];
    status: 'open' | 'investigating' | 'resolved';
    /** open/investigating + task não concluída na janela. */
    is_pending: boolean;
    reporter_name: string;
    manager_comment: string | null;
    created_at: string;
    resolved_at: string | null;
}

export const TASK_ISSUE_STATUS_LABEL: Record<AuditIssue['status'], string> = {
    open: 'Aberta',
    investigating: 'Em análise',
    resolved: 'Resolvida',
};

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
    /** s92 — DEPRECADO: primeira área. Use `areas`. */
    area: AreaInfo | null;
    /** s92 — todas as áreas da rotina, ordenadas por nome. */
    areas: AreaInfo[];
    user: UserInfo;
    unit?: UnitInfo;
    tasks: AuditTaskDetail[];
    /** Ocorrências operacionais registradas durante a execução. */
    issues: AuditIssue[];
}

/** Labels canônicos. */
export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
    completed: 'Concluído',
    incomplete: 'Incompleto',
    impediment: 'Com impedimento',
};

/**
 * Opções visíveis no filtro de Status do usuário.
 * 'incomplete' fica fora — não é atribuído atualmente (reservado p/ futuro).
 */
export const AUDIT_STATUS_OFFICIAL: AuditStatus[] = ['completed', 'impediment'];

export const AUDIT_TASK_STATUS_LABEL: Record<AuditTaskStatus, string> = {
    completed: 'Concluída',
    incomplete: 'Incompleta',
    impediment: 'Com impedimento',
    pending: 'Não executada',
    removed: 'Removida da rotina',
};

export const SHIFT_LABEL: Record<Shift, string> = {
    morning: 'Manhã',
    afternoon: 'Tarde',
    evening: 'Noite',
};
