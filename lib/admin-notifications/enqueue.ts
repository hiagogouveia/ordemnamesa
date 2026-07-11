import 'server-only'

import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import type { AdminNotificationEventType } from '@/lib/types'
import type { AdminNotificationPayloadMap } from './types'

interface RecipientJoinRow {
    admin_notification_recipients: { email: string } | null
}

/**
 * Enfileira uma notificação administrativa: cria 1 linha no outbox por destinatário
 * ATIVO inscrito no evento. Idempotente por (event_type, dedup_key, recipient_email)
 * — re-submits ou reprocessos nunca geram e-mail duplicado.
 *
 * Tolerante a falha: nunca lança (para não afetar o fluxo chamador). O envio real
 * acontece depois, em `processAdminNotificationOutbox`.
 *
 * @returns quantidade de destinatários enfileirados (0 se nenhum inscrito/erro).
 */
export async function enqueueAdminNotification<T extends AdminNotificationEventType>(
    eventType: T,
    dedupKey: string,
    payload: AdminNotificationPayloadMap[T]
): Promise<number> {
    try {
        const { data: subs, error: subsError } = await supabaseAdmin
            .from('admin_notification_subscriptions')
            .select('admin_notification_recipients!inner(email)')
            .eq('event_type', eventType)
            .eq('admin_notification_recipients.active', true)
            .returns<RecipientJoinRow[]>()

        if (subsError) {
            console.error('[enqueueAdminNotification] lookup error', subsError.message)
            return 0
        }

        const emails = Array.from(
            new Set(
                (subs ?? [])
                    .map((s) => s.admin_notification_recipients?.email?.trim())
                    .filter((e): e is string => Boolean(e))
            )
        )
        if (emails.length === 0) return 0

        const rows = emails.map((email) => ({
            event_type: eventType,
            dedup_key: dedupKey,
            recipient_email: email,
            payload,
        }))

        const { error: insertError } = await supabaseAdmin
            .from('admin_notification_outbox')
            .upsert(rows, {
                onConflict: 'event_type,dedup_key,recipient_email',
                ignoreDuplicates: true,
            })

        if (insertError) {
            console.error('[enqueueAdminNotification] outbox insert error', insertError.message)
            return 0
        }

        return emails.length
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        console.error('[enqueueAdminNotification] exception', message)
        return 0
    }
}
