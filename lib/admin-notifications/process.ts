import 'server-only'

import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { sendEmail } from '@/lib/email/send-email'
import type { AdminNotificationEventType, AdminNotificationOutboxRow } from '@/lib/types'
import type { NewLeadPayload } from './types'
import { renderNewLeadEmail } from './templates/new-lead'

const DEFAULT_LIMIT = 100
const MAX_BACKOFF_MINUTES = 60

export interface ProcessOutboxResult {
    processed: number
    sent: number
    failed: number
    skipped: number
}

/** Renderiza { subject, html } de acordo com o tipo de evento. */
function renderEmail(
    eventType: AdminNotificationEventType,
    payload: Record<string, unknown>
): { subject: string; html: string } {
    switch (eventType) {
        case 'new_lead':
            return renderNewLeadEmail(payload as unknown as NewLeadPayload)
        default:
            throw new Error(`Evento de notificação sem template: ${eventType}`)
    }
}

/** Backoff exponencial simples (em minutos), com teto. */
function backoffMinutes(attempts: number): number {
    return Math.min(2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MINUTES)
}

function nextAttemptIso(attempts: number): string {
    return new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString()
}

/**
 * Processa o outbox de notificações administrativas: para cada linha elegível
 * (status pending/failed, attempts < max, next_attempt_at <= agora), tenta um
 * "claim" atômico (compare-and-swap em attempts) para não colidir com o cron,
 * renderiza e envia via Resend, e grava o resultado.
 *
 * Idempotente e seguro para rodar em paralelo (after() + cron). Limite fixo por
 * rodada evita processamento infinito com fila grande.
 */
export async function processAdminNotificationOutbox(
    opts: { limit?: number } = {}
): Promise<ProcessOutboxResult> {
    const limit = opts.limit ?? DEFAULT_LIMIT
    const result: ProcessOutboxResult = { processed: 0, sent: 0, failed: 0, skipped: 0 }

    const nowIso = new Date().toISOString()
    const { data: rows, error } = await supabaseAdmin
        .from('admin_notification_outbox')
        .select('*')
        .in('status', ['pending', 'failed'])
        .lte('next_attempt_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(limit)
        .returns<AdminNotificationOutboxRow[]>()

    if (error) {
        console.error('[processAdminNotificationOutbox] select error', error.message)
        return result
    }

    for (const row of rows ?? []) {
        if (row.attempts >= row.max_attempts) {
            result.skipped += 1
            continue
        }

        const nextAttempts = row.attempts + 1

        // Claim atômico: só prossegue quem conseguir mover attempts (evita envio duplo).
        const { data: claimed } = await supabaseAdmin
            .from('admin_notification_outbox')
            .update({ attempts: nextAttempts, next_attempt_at: nextAttemptIso(nextAttempts) })
            .eq('id', row.id)
            .eq('status', row.status)
            .eq('attempts', row.attempts)
            .select('id')
            .maybeSingle<{ id: string }>()

        if (!claimed) {
            result.skipped += 1
            continue
        }

        result.processed += 1

        let subject: string
        let html: string
        try {
            const rendered = renderEmail(row.event_type, row.payload)
            subject = rendered.subject
            html = rendered.html
        } catch (err) {
            const message = err instanceof Error ? err.message : 'render error'
            await supabaseAdmin
                .from('admin_notification_outbox')
                .update({ status: 'failed', last_error: message })
                .eq('id', row.id)
            result.failed += 1
            continue
        }

        const sendResult = await sendEmail({ to: row.recipient_email, subject, html })

        if (sendResult.ok) {
            await supabaseAdmin
                .from('admin_notification_outbox')
                .update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    provider_message_id: sendResult.id ?? null,
                    last_error: null,
                })
                .eq('id', row.id)
            result.sent += 1
        } else {
            await supabaseAdmin
                .from('admin_notification_outbox')
                .update({ status: 'failed', last_error: sendResult.error ?? 'send failed' })
                .eq('id', row.id)
            result.failed += 1
        }
    }

    return result
}
