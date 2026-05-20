export interface Lead {
    id: string
    name: string
    organization_name: string
    email: string
    phone: string
    city: string | null
    state: string | null
    custom_fields: Record<string, unknown>
    status: 'new' | 'contacted' | 'approved' | 'rejected'
    approved_entity_id: string | null
    approved_user_id: string | null
    notes: string | null
    created_at: string
    updated_at: string
}

export type CustomFieldType =
    | 'text'
    | 'email'
    | 'tel'
    | 'select'
    | 'segmented'
    | 'boolean'
    | 'textarea'

export interface CustomFieldConfig {
    name: string
    label?: string
    type: CustomFieldType
    required?: boolean
    helper?: string
    placeholder?: string
    options?: { value: string; label: string }[]
}

export interface LeadScoringConfig {
    hot?: (lead: Lead) => boolean
    warm?: (lead: Lead) => boolean
    cold?: (lead: Lead) => boolean
}

export interface LeadControlHubConfig {
    appName: string
    entityNoun: string
    panelBasePath: string
    staffTableName: string
    adminEmailsEnv: string
    customFields: CustomFieldConfig[]
    whatsappAdminNumber: string
    whatsappTemplate?: (lead: Pick<Lead, 'name' | 'organization_name' | 'custom_fields'>) => string
    leadScoring?: LeadScoringConfig
}
