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
    // Sprint 73 — fuso operacional (IANA). Default 'America/Sao_Paulo'.
    timezone?: string
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
    | { version: 2; type: 'monthly'; mode: 'days_of_month'; days: number[] } // 1..31; -1 = último dia do mês
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
    // Sprint 62 — Auditoria de turno (snapshot no momento da assunção).
    assumption_shift_id?: string | null // deprecado (single) — ver assumption_shift_ids
    assumption_shift_ids?: string[] | null // Sprint 68 — turnos da rotina (N:N) no momento
    assumption_user_shift_ids?: string[] | null
}

export interface Checklist {
    id: string
    restaurant_id: string
    name: string
    description?: string
    shift: ShiftType
    // Sprint 61 — Turno cadastrado (shifts.id). NULL = "Todos os turnos".
    // Sprint 66: DEPRECADO — mantido como sombra (primário) durante transição.
    // A fonte da verdade dos turnos é o N:N (shift_ids / checklist_shifts).
    shift_id?: string | null
    // Sprint 66 — Turnos da rotina (N:N). Conjunto vazio = "Todos os turnos".
    shift_ids?: string[]
    // Turnos resolvidos (id+nome) para exibição (board). Vem do join checklist_shifts.
    shifts?: { id: string; name: string }[]
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
    allow_early_start?: boolean // Sprint 76: permite iniciar antes do start_time
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
    // Sprint 53 — instância descartável criada ad-hoc, executada uma vez e
    // auto-arquivada. Atualmente usada por "Recebimento rápido"; nome genérico
    // para reuso futuro em tarefas emergenciais / contingências.
    is_one_shot?: boolean
    // Sprint 56 — execução instanciada a partir de modelo de recebimento
    source_template_id?: string | null
    supplier_id?: string | null
    supplier?: Supplier | null
    // Sprint 70 — Modelos de Rotinas Prontas. Rastreabilidade da origem quando a
    // rotina foi importada do catálogo global. Somente registro — não sincroniza.
    origin_template_id?: string | null
    origin_template_version?: number | null
}

// Sprint 56 — Receiving Templates + Suppliers
export interface Supplier {
    id: string
    restaurant_id: string
    name: string
    cnpj?: string | null
    active: boolean
    created_at: string
    created_by?: string | null
}

export interface ReceivingTemplate {
    id: string
    restaurant_id: string
    name: string
    description?: string | null
    area_id: string
    role_id?: string | null
    assigned_to_user_id?: string | null
    shift?: 'morning' | 'afternoon' | 'evening' | null
    shift_id?: string | null // Sprint 63 — DEPRECADO (sombra); ver shift_ids (N:N)
    shift_ids?: string[] // Sprint 67 — turnos do modelo (N:N). Vazio = todos os turnos
    shifts?: { id: string; name: string }[] // turnos resolvidos para exibição
    recurrence: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom' | 'shift_days'
    recurrence_config?: RecurrenceConfig | RecurrenceV2 | null
    enforce_sequential_order: boolean
    active: boolean
    created_at: string
    created_by?: string | null
    updated_at: string
    tasks?: ReceivingTemplateTask[]
    area?: Area | null
}

export interface ReceivingTemplateTask {
    id: string
    template_id: string
    restaurant_id: string
    title: string
    description?: string | null
    order: number
    requires_photo: boolean
    is_critical: boolean
    requires_observation: boolean
    type?: TaskType | null
    max_photos?: number | null
    task_config?: TaskConfig | null
}

// Sprint 48 (Etapa 4): ReceivingExpectation removida do código TS. A tabela
// `receiving_expectations` permanece no banco como histórico read-only.
// Substituída pelo modelo Etapa 2: receiving_templates + checklists one-shot.

// Sprint 70 — Modelos de Rotinas Prontas (catálogo global, read-only)
export type TemplateCategory =
    | 'caixa'
    | 'cozinha'
    | 'salao'
    | 'estoque'
    | 'limpeza'
    | 'banheiros'
    | 'seguranca_alimentar'
    | 'equipamentos'
    | 'manutencao'
    | 'delivery'
    | 'administrativo'

export interface ChecklistTemplateItem {
    id: string
    template_id: string
    item_slug: string
    title: string
    description?: string | null
    order: number
    requires_photo: boolean
    is_critical: boolean
    requires_observation: boolean
    type?: TaskType | null
    max_photos?: number | null
    task_config?: TaskConfig | null
}

export interface ChecklistTemplate {
    id: string
    slug: string
    name: string
    description?: string | null
    category: TemplateCategory
    icon?: string | null
    suggested_type: 'regular' | 'opening' | 'closing'
    suggested_area_label?: string | null
    suggested_recurrence?: string | null
    suggested_recurrence_config?: RecurrenceConfig | RecurrenceV2 | null
    is_premium: boolean
    is_active: boolean
    version: number
    sort_order: number
    items?: ChecklistTemplateItem[]
}

// Sprint 72 — Kits de Rotinas (catálogo global de implantação)
export type KitSegment =
    | 'restaurante'
    | 'hamburgueria'
    | 'pizzaria'
    | 'cafeteria'
    | 'fast_food'
    | 'gastrobar'

export type KitRequirementLevel = 'obrigatorio' | 'recomendado' | 'opcional'

export interface ChecklistKitItem {
    template_id: string
    requirement_level: KitRequirementLevel
    sort_order: number
    // dados do modelo para exibição (preenchidos pelo GET)
    template_slug: string
    template_name: string
    template_category: TemplateCategory
    template_icon?: string | null
    template_suggested_area?: string | null
    template_item_count: number
}

export interface ChecklistKit {
    id: string
    slug: string
    name: string
    description?: string | null
    segment: KitSegment
    icon?: string | null
    is_active: boolean
    version: number
    sort_order: number
    items?: ChecklistKitItem[]
}

export interface ApplyKitResult {
    created_count: number
    created_checklist_ids: string[]
    skipped_count: number
    skipped_template_ids: string[]
    created_area_ids: string[]
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
    shift_id?: string | null // Sprint 61 — DEPRECADO (sombra)
    shift_ids?: string[] // Sprint 66 — turnos da rotina (N:N); vazio = todos os turnos
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
// Sprint 77 — Canais de notificação (Telegram fase 1)
// ============================================================

export type NotificationChannelType = 'telegram' | 'whatsapp' | 'email'

export interface NotificationChannel {
    id: string
    user_id: string
    restaurant_id: string | null
    channel_type: NotificationChannelType
    external_id: string
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface TelegramLinkToken {
    id: string
    user_id: string
    token: string
    expires_at: string
    used_at: string | null
    created_at: string
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

