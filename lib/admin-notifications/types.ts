import type { AdminNotificationEventType } from '@/lib/types'

/**
 * Payload persistido no outbox e usado para renderizar o e-mail de "novo lead".
 * Snapshot dos dados do lead no momento do enqueue — não depende de re-consultar
 * a tabela `leads` na hora do envio.
 */
export interface NewLeadPayload {
    leadId: string
    name: string
    organizationName: string
    email: string
    phone: string
    city: string | null
    state: string | null
    cnpj: string | null
    leadSource: string
    score: 'quente' | 'frio' | 'neutro'
    customFields: Record<string, unknown>
    createdAt: string
}

/** Mapa de payloads por tipo de evento. Cresce conforme novos eventos surgem. */
export interface AdminNotificationPayloadMap {
    new_lead: NewLeadPayload
}

export type AdminNotificationPayload<T extends AdminNotificationEventType = AdminNotificationEventType> =
    AdminNotificationPayloadMap[T]
