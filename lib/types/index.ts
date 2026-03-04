export type ChecklistStatus = 'active' | 'draft' | 'archived'
export type Shift = 'morning' | 'afternoon' | 'evening' | 'any'
export type UserRole = 'owner' | 'manager' | 'staff'

export interface Checklist {
    id: string
    restaurant_id: string
    name: string
    description?: string
    shift: Shift
    status: ChecklistStatus
    active: boolean
    created_by: string
    created_at: string
    category?: string
    tasks?: ChecklistTask[]
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
}
