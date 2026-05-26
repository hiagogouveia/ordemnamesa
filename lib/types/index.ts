export interface Restaurant {
    id: string
    name: string
    slug: string
    owner_id: string
    logo_url?: string | null
    active: boolean
    cnpj?: string | null
    phone?: string | null
    cep?: string | null
    address?: string | null
    created_at: string
    account_id: string
    is_primary: boolean
    deleted_at?: string | null
}

// Sprint 28 — Accounts (tenant de topo)
export type AccountRole = 'owner' | 'manager'

export interface Account {
    id: string
    name: string
    plan_id?: string | null
    active: boolean
    created_at: string
    updated_at: string
}

export interface AccountUser {
    id: string
    account_id: string
    user_id: string
    role: AccountRole
    active: boolean
    created_at: string
}

export type ChecklistStatus = 'active' | 'archived'
// 'blocked' deprecado em s44 — preservado para compat de leitura de dados antigos.
// Novo fluxo: ocorrências vivem em TaskIssue (ver abaixo) e não bloqueiam execução.
export type ExecutionStatus = 'not_started' | 'in_progress' | 'done' | 'blocked' | 'overdue' | 'incomplete'
export type ShiftType = 'morning' | 'afternoon' | 'evening' | 'any' // Rename to avoid conflict with Shift table or keep? Let's keep it Shift for now, but the new table is 'shifts'
export type UserRole = 'owner' | 'manager' | 'staff'

// Sprint 8 — formato legado (v1). Mantido para compatibilidade total.
export interface RecurrenceConfig {
    frequency: 'daily' | 'weekly' | 'monthly'
    interval: number           // a cada X dias/semanas/meses
    days_of_week?: number[]    // 0=Dom, 1=Seg, ..., 6=Sab (apenas para weekly)
    end_type: 'never' | 'date' | 'count'
    end_date?: string          // ISO date string
    end_count?: number
}

// Sprint 34 — Recorrência v2 (discriminated union).
// Roteamento: payload só é tratado como v2 se `version === 2` (estrito numérico).
// Qualquer outro caso cai na lógica v1 sem alteração.
export type WeekOfMonth = 1 | 2 | 3 | 4 | -1

export type RecurrenceV2 =
    | { version: 2; type: 'daily' }
    | { version: 2; type: 'weekly'; weekdays: number[] }
    | { version: 2; type: 'shift_days' }
    | { version: 2; type: 'monthly'; mode: 'day_of_month'; day: number }
    | { version: 2; type: 'monthly'; mode: 'weekday_position'; weekday: number; weekOfMonth: WeekOfMonth }
    | { version: 2; type: 'yearly'; mode: 'date'; day: number; month: number }
    | { version: 2; type: 'yearly'; mode: 'weekday_position'; weekday: number; weekOfMonth: WeekOfMonth; month: number }
    | { version: 2; type: 'custom'; rrule: string }

// Tipo unificado do campo `recurrence_config` no banco. Aceita v1 legado e v2.
export type RecurrenceConfigField = RecurrenceConfig | RecurrenceV2

// Sprint 8
export interface ChecklistAssumption {
    id: string
    restaurant_id: string
    checklist_id: string
    user_id: string
    user_name: string
    date_key: string
    assumed_at: string
    completed_at?: string
    completed_by_user_id?: string
    completed_by_user_name?: string
    observation?: string
    execution_status: 'in_progress' | 'blocked' | 'done'
    blocked_reason?: string | null
}

export interface Checklist {
    id: string
    restaurant_id: string
    name: string
    description?: string
    shift: ShiftType
    status: ChecklistStatus
    active: boolean
    created_by: string
    created_at: string
    category?: string
    role_id?: string
    assigned_to_user_id?: string
    is_required?: boolean
    checklist_type?: 'regular' | 'opening' | 'closing' | 'receiving'
    recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom' | 'shift_days'
    last_reset_at?: string
    start_time?: string        // Sprint 8: formato HH:mm
    end_time?: string          // Sprint 8: formato HH:mm
    recurrence_config?: RecurrenceConfig // Sprint 8
    enforce_sequential_order?: boolean
    order_index?: number | null
    tasks?: ChecklistTask[]
    roles?: Role
    // Sprint 13: My Activities
    area_id?: string | null
    target_role?: TargetRole
    // Sprint 21: Assignment type independente
    assignment_type?: AssignmentType
    area?: Area | null
    responsible?: { id: string; name: string } | null
    execution_status?: ExecutionStatus
    assumed_by_name?: string | null
    assumed_by_user_id?: string | null
    unit?: { id: string; name: string } | null
    // Sprint 48 — Receiving Routines (fase 1: campos estruturais)
    receiving_mode?: 'on_demand' | 'recurring' | null
    receiving_generation?: 'automatic' | 'manager_confirmation' | null
    supplier_name?: string | null
    // Sprint 53 — instância descartável criada ad-hoc, executada uma vez e
    // auto-arquivada. Atualmente usada por "Recebimento rápido"; nome genérico
    // para reuso futuro em tarefas emergenciais / contingências.
    is_one_shot?: boolean
}

// Sprint 48 — Receiving Routines
export type ReceivingExpectationStatus = 'pending' | 'confirmed' | 'overdue' | 'cancelled'

export interface ReceivingExpectation {
    id: string
    restaurant_id: string
    checklist_id: string
    expected_date: string             // ISO date (YYYY-MM-DD)
    expected_window_start?: string | null  // HH:mm
    expected_window_end?: string | null    // HH:mm
    status: ReceivingExpectationStatus
    assumption_id?: string | null
    confirmed_by?: string | null
    confirmed_at?: string | null
    cancelled_reason?: string | null
    created_at: string
}

// Sprint 35 — Tipos de resposta estruturados
export type TaskType = 'boolean' | 'date' | 'number' | 'rating'

export interface TaskConfig {
    min_value?: number
    max_value?: number
}

export interface ChecklistTask {
    id: string
    checklist_id: string
    restaurant_id: string
    title: string
    description?: string
    requires_photo: boolean
    is_critical: boolean
    order: number
    assigned_to_user_id?: string
    role_id?: string
    // Sprint 35
    type?: TaskType | null
    requires_observation?: boolean
    max_photos?: number | null
    task_config?: TaskConfig | null
}

// Sprint 6
export interface Shift {
    id: string
    restaurant_id: string
    name: string
    start_time: string
    end_time: string
    days_of_week: number[] // 0=Sunday, 6=Saturday
    shift_type?: 'morning' | 'afternoon' | 'evening' | null
    active: boolean
    created_at: string
    updated_at: string
}

export interface Role {
    id: string
    restaurant_id: string
    name: string
    color: string
    max_concurrent_tasks: number
    can_launch_purchases: boolean
    active: boolean
    created_at: string
    updated_at: string
}

export interface UserRoleAssignment {
    id: string
    restaurant_id: string
    user_id: string
    role_id: string
    created_at: string
    role?: Role
    roles?: Role
}

export interface UserShiftAssignment {
    id: string
    restaurant_id: string
    user_id: string
    shift_id: string
    created_at: string
    shifts?: Shift
}

// Sprint 50: PurchaseList / PurchaseItem removidos (sistema legado de Compras).
// Substituídos por receiving_expectations + ReceivingExpectation acima.

// ============================================================
// Sprint 14 — Checklist Management Board
// ============================================================

export interface ChecklistOrder {
    id: string
    restaurant_id: string
    checklist_id: string
    shift: 'morning' | 'afternoon' | 'evening'
    position: number
}

// ============================================================
// Sprint 13 — Areas & My Activities
// ============================================================

export type PriorityMode = 'auto' | 'manual'

export interface Area {
    id: string
    restaurant_id: string
    name: string
    description?: string | null
    color: string
    priority_mode?: PriorityMode
    max_parallel_tasks?: number | null
    /** Se true, colaboradores desta área podem iniciar recebimentos manuais. */
    allow_manual_receiving?: boolean
    created_at: string
}

export type AssignmentType = 'area' | 'user' | 'all'
export type TargetRole = 'staff' | 'manager' | 'owner' | 'all'
export type MyActivityStatus = 'pending' | 'in_progress' | 'done_today' | 'overdue'

export interface MyActivity {
    id: string
    restaurant_id: string
    name: string
    description?: string | null
    shift: ShiftType
    checklist_type: 'regular' | 'opening' | 'closing' | 'receiving'
    is_required: boolean
    start_time?: string | null
    end_time?: string | null
    target_role: TargetRole
    area_id?: string | null
    area?: Area | null
    order_index?: number | null
    task_count: number
    done_count: number
    progress_percent: number
    activity_status: MyActivityStatus
    assumed_by_name?: string | null
    assumed_by_user_id?: string | null
}

// ============================================================
// Sprint 17 — Notifications
// ============================================================

export type NotificationType =
    | 'TASK_COMPLETED_WITH_NOTE'
    | 'NEW_TASK_ASSIGNED'
    | 'NEW_TASK_FOR_AREA'
    | 'PASSWORD_CHANGED_BY_ADMIN'
    | 'BLOCKED_ROUTINE'

export interface Notification {
    id: string
    restaurant_id: string
    user_id: string
    type: NotificationType
    title: string
    description?: string | null
    read: boolean
    created_at: string
    metadata?: Record<string, unknown> | null
    related_id?: string | null
}

// ============================================================
// Sprint 45 — Ocorrências operacionais (task_issues)
// Desacoplado de task_executions: a task pode ser concluída normalmente
// mesmo com ocorrência aberta. Gestor/owner trata via status + comentário.
// ============================================================

export type TaskIssueStatus = 'open' | 'investigating' | 'resolved'
export type TaskIssueEventType = 'created' | 'status_changed' | 'comment_added' | 'resolved' | 'reopened' | 'edited'

export interface TaskIssue {
    id: string
    restaurant_id: string
    task_execution_id: string | null
    task_id: string
    checklist_id: string
    checklist_assumption_id: string | null
    reported_by: string
    description: string
    photos: string[]
    status: TaskIssueStatus
    manager_comment: string | null
    resolved_by: string | null
    resolved_at: string | null
    reopened_by: string | null
    reopened_at: string | null
    severity: string | null
    category: string | null
    requires_photo: boolean
    created_at: string
    updated_at: string
}

export interface TaskIssueEvent {
    id: string
    task_issue_id: string
    restaurant_id: string
    event_type: TaskIssueEventType
    from_status: TaskIssueStatus | null
    to_status: TaskIssueStatus | null
    comment: string | null
    metadata: Record<string, unknown>
    actor_user_id: string
    created_at: string
}

