import type { AdminNotificationEventType } from '@/lib/types'

/**
 * Catálogo de eventos administrativos disponíveis para inscrição na UI.
 * Apenas rótulos (não é um registry com lógica) — cresce ao adicionar eventos.
 */
export const ADMIN_NOTIFICATION_EVENTS: { value: AdminNotificationEventType; label: string }[] = [
    { value: 'new_lead', label: 'Novo lead' },
]

const EVENT_LABELS = new Map(ADMIN_NOTIFICATION_EVENTS.map((e) => [e.value, e.label]))

export function adminNotificationEventLabel(value: string): string {
    return EVENT_LABELS.get(value as AdminNotificationEventType) ?? value
}

export function isValidAdminNotificationEvent(value: string): value is AdminNotificationEventType {
    return EVENT_LABELS.has(value as AdminNotificationEventType)
}
