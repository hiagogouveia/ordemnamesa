'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireSuperAdmin } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { config } from '@/lead-control-hub.config'
import { isValidAdminNotificationEvent } from '@/lib/admin-notifications/events-catalog'
import { renderActionEmail } from '@/lib/email/templates'
import { sendEmail } from '@/lib/email/send-email'
import type { AdminNotificationEventType } from '@/lib/types'

export interface RecipientActionResult {
    ok?: boolean
    error?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PANEL_PATH = `${config.panelBasePath}/notificacoes`

function normalizeEvents(events: string[]): AdminNotificationEventType[] {
    return Array.from(new Set(events.filter(isValidAdminNotificationEvent)))
}

async function replaceSubscriptions(recipientId: string, events: AdminNotificationEventType[]): Promise<void> {
    await supabaseAdmin.from('admin_notification_subscriptions').delete().eq('recipient_id', recipientId)
    if (events.length > 0) {
        await supabaseAdmin
            .from('admin_notification_subscriptions')
            .insert(events.map((event_type) => ({ recipient_id: recipientId, event_type })))
    }
}

export async function addRecipientAction(
    email: string,
    label: string,
    events: string[]
): Promise<RecipientActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const normalizedEmail = email.trim().toLowerCase()
    if (!EMAIL_RE.test(normalizedEmail)) return { error: 'E-mail inválido.' }
    const cleanLabel = label.trim().slice(0, 100) || null
    const validEvents = normalizeEvents(events)

    const { data: recipient, error } = await supabaseAdmin
        .from('admin_notification_recipients')
        .insert({
            email: normalizedEmail,
            label: cleanLabel,
            created_by: guard.ctx.user.email?.toLowerCase() ?? 'unknown',
        })
        .select('id')
        .single<{ id: string }>()

    if (error || !recipient) {
        if (error?.message.includes('duplicate') || error?.code === '23505') {
            return { error: 'E-mail já cadastrado.' }
        }
        return { error: `Falha ao adicionar: ${error?.message ?? 'erro desconhecido'}` }
    }

    await replaceSubscriptions(recipient.id, validEvents)

    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'create_notification_recipient',
        targetType: 'notification_recipient',
        targetId: recipient.id,
        metadata: { email: normalizedEmail, label: cleanLabel, events: validEvents },
    })

    revalidatePath(PANEL_PATH)
    return { ok: true }
}

export async function updateRecipientSubscriptionsAction(
    recipientId: string,
    events: string[]
): Promise<RecipientActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const validEvents = normalizeEvents(events)
    await replaceSubscriptions(recipientId, validEvents)

    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'update_notification_recipient',
        targetType: 'notification_recipient',
        targetId: recipientId,
        metadata: { events: validEvents },
    })

    revalidatePath(PANEL_PATH)
    return { ok: true }
}

export async function toggleRecipientAction(
    recipientId: string,
    active: boolean
): Promise<RecipientActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const { error } = await supabaseAdmin
        .from('admin_notification_recipients')
        .update({ active })
        .eq('id', recipientId)
    if (error) return { error: 'Falha ao atualizar.' }

    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: active ? 'activate_notification_recipient' : 'deactivate_notification_recipient',
        targetType: 'notification_recipient',
        targetId: recipientId,
    })

    revalidatePath(PANEL_PATH)
    return { ok: true }
}

export async function removeRecipientAction(recipientId: string): Promise<RecipientActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    // subscriptions caem por ON DELETE CASCADE.
    const { error } = await supabaseAdmin
        .from('admin_notification_recipients')
        .delete()
        .eq('id', recipientId)
    if (error) return { error: 'Falha ao remover.' }

    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'delete_notification_recipient',
        targetType: 'notification_recipient',
        targetId: recipientId,
    })

    revalidatePath(PANEL_PATH)
    return { ok: true }
}

/**
 * Envia um e-mail de teste (mesma infra: renderActionEmail → sendEmail), sem passar
 * pelo outbox nem criar lead. Valida configuração/Resend/template/destino. Diagnóstico:
 * não gera linha em admin_logs nem no outbox.
 */
export async function sendTestEmailAction(recipientId: string): Promise<RecipientActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const { data: recipient } = await supabaseAdmin
        .from('admin_notification_recipients')
        .select('email')
        .eq('id', recipientId)
        .single<{ email: string }>()
    if (!recipient?.email) return { error: 'Destinatário não encontrado.' }

    const html = renderActionEmail({
        title: 'E-mail de teste — Ordem na Mesa',
        greeting: 'Este é um envio de teste.',
        bodyHtml: `
          <p>Se você recebeu esta mensagem, a configuração de notificações administrativas
          (Resend, template e destinatário) está funcionando corretamente.</p>
          <p style="color:#64748b;font-size:13px">Nenhuma ação é necessária.</p>
        `,
        ctaLabel: 'Abrir Control Hub',
        ctaUrl: `${(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ordemnamesa.com.br').replace(/\/$/, '')}${config.panelBasePath}/notificacoes`,
        footerNote: 'E-mail de teste disparado manualmente pelo Control Hub.',
    })

    const result = await sendEmail({
        to: recipient.email,
        subject: 'E-mail de teste — Ordem na Mesa',
        html,
    })

    if (!result.ok) return { error: `Falha no envio: ${result.error ?? 'erro desconhecido'}` }
    return { ok: true }
}
