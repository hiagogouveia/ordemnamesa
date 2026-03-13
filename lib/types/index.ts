export type ChecklistStatus = 'active' | 'draft' | 'archived'
export type ShiftType = 'morning' | 'afternoon' | 'evening' | 'any' // Rename to avoid conflict with Shift table or keep? Let's keep it Shift for now, but the new table is 'shifts'
export type UserRole = 'owner' | 'manager' | 'staff'

// Sprint 8
export interface RecurrenceConfig {
    frequency: 'daily' | 'weekly' | 'monthly'
    interval: number           // a cada X dias/semanas/meses
    days_of_week?: number[]    // 0=Dom, 1=Seg, ..., 6=Sab (apenas para weekly)
    end_type: 'never' | 'date' | 'count'
    end_date?: string          // ISO date string
    end_count?: number
}

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
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom'
    last_reset_at?: string
    start_time?: string        // Sprint 8: formato HH:mm
    end_time?: string          // Sprint 8: formato HH:mm
    recurrence_config?: RecurrenceConfig // Sprint 8
    tasks?: ChecklistTask[]
    roles?: Role
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
}

// Sprint 6
export interface Shift {
    id: string
    restaurant_id: string
    name: string
    start_time: string
    end_time: string
    days_of_week: number[] // 0=Sunday, 6=Saturday
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

export interface PurchaseList {
    id: string
    restaurant_id: string
    title: string
    status: 'open' | 'closed'
    target_role_ids: string[]
    created_by: string
    closed_at?: string
    created_at: string
    updated_at: string
}

export interface PurchaseItem {
    id: string
    restaurant_id: string
    purchase_list_id: string
    name: string
    quantity: number
    unit: string
    brand?: string
    notes?: string
    checked: boolean
    checked_by?: string
    checked_at?: string
    has_problem: boolean
    problem_notes?: string
    created_at: string
    updated_at: string
}
