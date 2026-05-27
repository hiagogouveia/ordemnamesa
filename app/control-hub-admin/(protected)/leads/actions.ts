'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { renderSetupEmail } from '@/lib/admin-leads-control-hub/email'
import { provisionLeadAccount } from '@/lib/admin-leads-control-hub/provision-lead-account'
import { sendRecoveryEmail } from '@/lib/email/send-recovery-email'
import {
    checkLeadDuplicates,
    hasBlockingDuplicates,
    type DuplicateCheckResult,
} from '@/lib/admin-leads-control-hub/duplicate-check'
import { config } from '@/lead-control-hub.config'
import type { Lead } from '@/lib/admin-leads-control-hub/types'
import { trackAdminEvent, trackOnboardingEvent } from '@/lib/analytics/track-event'

export interface ApproveLeadResult {
    ok?: boolean
    error?: string
    entityId?: string
    requiresConfirmation?: boolean
    duplicates?: DuplicateCheckResult
    emailSent?: boolean
    emailError?: string
}

export interface RejectLeadResult {
    ok?: boolean
    error?: string
}

export interface ResendSetupEmailResult {
    ok?: boolean
    error?: string
    throttled?: boolean
    retryAfterSeconds?: number
}

const RESEND_DEBOUNCE_SECONDS = 60

export async function approveLeadAction(
    leadId: string,
    options: { force?: boolean } = {}
): Promise<ApproveLeadResult> {
    const guard = await requireStaff()
    if ('error' in guard) return { error: guard.error }
    const adminEmail = guard.ctx.user.email!.toLowerCase()

    const h = await headers()
    const ipAddress = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    const userAgent = h.get('user-agent') || null

    const { data: leadRaw } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()
    if (!leadRaw) return { error: 'Lead não encontrado.' }
    const lead = leadRaw as Lead
    if (lead.status === 'approved') return { error: 'Este lead já foi aprovado.' }
    if (lead.status === 'rejected') return { error: 'Lead rejeitado, não é possível aprovar.' }

    const duplicates = await checkLeadDuplicates(lead)
    if (!options.force && hasBlockingDuplicates(duplicates)) {
        return { requiresConfirmation: true, duplicates }
    }

    let provisioned
    try {
        provisioned = await provisionLeadAccount({ lead })
    } catch (err) {
        console.error('[approveLeadAction] provisionLeadAccount failed', {
            leadId,
            email: lead.email.toLowerCase(),
            organization: lead.organization_name,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
        })
        return {
            error:
                err instanceof Error
                    ? `Falha ao provisionar conta: ${err.message}`
                    : 'Falha ao provisionar conta.',
        }
    }

    await supabaseAdmin
        .from('leads')
        .update({
            status: 'approved',
            approved_entity_id: provisioned.accountId,
            approved_user_id: provisioned.userId,
        })
        .eq('id', leadId)

    const leadSource = (lead.custom_fields?.lead_source as string | undefined) ?? null

    await logAdminAction({
        adminEmail,
        action: 'approve_lead',
        targetType: 'lead',
        targetId: leadId,
        metadata: {
            isNewUser: provisioned.isNewUser,
            account_id: provisioned.accountId,
            restaurant_id: provisioned.restaurantId,
            entity_name: provisioned.accountName,
            lead_source: leadSource,
            forced: !!options.force,
        },
        ipAddress,
        userAgent,
    })
    await logAdminAction({
        adminEmail,
        action: 'trial_created',
        targetType: 'subscription',
        targetId: provisioned.subscriptionId,
        metadata: {
            lead_id: leadId,
            account_id: provisioned.accountId,
            restaurant_id: provisioned.restaurantId,
            plan_code: provisioned.trialPlanCode,
            trial_days: provisioned.trialDays,
            trial_ends_at: provisioned.trialEndsAt,
        },
        ipAddress,
        userAgent,
    })

    await trackAdminEvent('lead_approved', {
        userId: provisioned.userId,
        metadata: {
            lead_id: leadId,
            entity_id: provisioned.accountId,
            is_new_user: provisioned.isNewUser,
            lead_source: leadSource,
        },
    })
    await trackOnboardingEvent('restaurant_created', {
        restaurantId: provisioned.restaurantId,
        userId: provisioned.userId,
        metadata: {
            source: 'lead_approval',
            lead_id: leadId,
            is_new_user: provisioned.isNewUser,
        },
    })

    const emailOutcome = await dispatchSetupEmail({
        leadId,
        email: lead.email,
        leadName: lead.name,
        entityName: provisioned.accountName,
        trialDays: provisioned.trialDays,
        restaurantId: provisioned.restaurantId,
        source: 'approveLeadAction',
    })

    revalidatePath(`${config.panelBasePath}/leads`)
    revalidatePath(`${config.panelBasePath}/leads/${leadId}`)
    return {
        ok: true,
        entityId: provisioned.accountId,
        emailSent: emailOutcome.ok,
        ...(emailOutcome.ok ? {} : { emailError: emailOutcome.error }),
    }
}

interface DispatchSetupEmailInput {
    leadId: string
    email: string
    leadName: string
    entityName: string
    trialDays?: number
    restaurantId?: string
    source: 'approveLeadAction' | 'resendSetupEmailAction'
}

async function dispatchSetupEmail(
    input: DispatchSetupEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { leadId, email, leadName, entityName, trialDays, restaurantId, source } = input
    const normalizedEmail = email.toLowerCase()

    const result = await sendRecoveryEmail({
        email: normalizedEmail,
        renderHtml: (actionLink) =>
            renderSetupEmail({
                setupLink: actionLink,
                entityName,
                leadName,
                trialDays,
            }),
        logContext: { source, leadId, email: normalizedEmail, restaurantId, entityName },
    })

    if (result.ok) {
        const { error: updErr } = await supabaseAdmin
            .from('leads')
            .update({
                setup_email_sent_at: new Date().toISOString(),
                setup_email_last_error: null,
            })
            .eq('id', leadId)
        if (updErr) {
            console.error(`[${source}] update leads setup_email_sent_at`, {
                leadId,
                email: normalizedEmail,
                error: updErr.message,
            })
        }
        return { ok: true }
    }

    const errorLabel = `${result.reason}${result.error ? `: ${result.error}` : ''}`
    const { error: updErr } = await supabaseAdmin
        .from('leads')
        .update({ setup_email_last_error: errorLabel })
        .eq('id', leadId)
    if (updErr) {
        console.error(`[${source}] update leads setup_email_last_error`, {
            leadId,
            email: normalizedEmail,
            error: updErr.message,
        })
    }
    return { ok: false, error: errorLabel }
}

export async function resendSetupEmailAction(
    leadId: string
): Promise<ResendSetupEmailResult> {
    const guard = await requireStaff()
    if ('error' in guard) return { error: guard.error }
    const adminEmail = guard.ctx.user.email!.toLowerCase()

    const h = await headers()
    const ipAddress = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    const userAgent = h.get('user-agent') || null

    const { data: leadRaw } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()
    if (!leadRaw) {
        console.error('[resendSetupEmailAction] lead not found', { leadId })
        return { error: 'Lead não encontrado.' }
    }
    const lead = leadRaw as Lead
    if (lead.status !== 'approved') {
        return { error: 'Só é possível reenviar e-mail de setup para leads aprovados.' }
    }

    if (lead.setup_email_sent_at && !lead.setup_email_last_error) {
        const ageMs = Date.now() - new Date(lead.setup_email_sent_at).getTime()
        const ageSeconds = Math.floor(ageMs / 1000)
        if (ageSeconds < RESEND_DEBOUNCE_SECONDS) {
            const retryAfterSeconds = RESEND_DEBOUNCE_SECONDS - ageSeconds
            console.error('[resendSetupEmailAction] debounce hit', {
                leadId,
                email: lead.email.toLowerCase(),
                ageSeconds,
            })
            return {
                throttled: true,
                retryAfterSeconds,
                error: `Aguarde ${retryAfterSeconds}s antes de reenviar.`,
            }
        }
    }

    let entityName = lead.organization_name
    let trialDays: number | undefined
    if (lead.approved_entity_id) {
        const { data: accountRow } = await supabaseAdmin
            .from('accounts')
            .select('name')
            .eq('id', lead.approved_entity_id)
            .maybeSingle<{ name: string }>()
        if (accountRow?.name) entityName = accountRow.name
    }

    const outcome = await dispatchSetupEmail({
        leadId,
        email: lead.email,
        leadName: lead.name,
        entityName,
        trialDays,
        restaurantId: lead.approved_entity_id ?? undefined,
        source: 'resendSetupEmailAction',
    })

    await logAdminAction({
        adminEmail,
        action: 'resend_setup_email',
        targetType: 'lead',
        targetId: leadId,
        metadata: {
            ok: outcome.ok,
            error: outcome.ok ? null : outcome.error,
            entity_id: lead.approved_entity_id,
        },
        ipAddress,
        userAgent,
    })

    revalidatePath(`${config.panelBasePath}/leads`)
    revalidatePath(`${config.panelBasePath}/leads/${leadId}`)

    if (outcome.ok) return { ok: true }
    return { error: outcome.error }
}

export async function rejectLeadAction(
    leadId: string,
    reason?: string
): Promise<RejectLeadResult> {
    const guard = await requireStaff()
    if ('error' in guard) return { error: guard.error }
    const adminEmail = guard.ctx.user.email!.toLowerCase()

    const h = await headers()
    const ipAddress = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null

    const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('id, status')
        .eq('id', leadId)
        .single<{ id: string; status: Lead['status'] }>()
    if (!lead) return { error: 'Lead não encontrado.' }
    if (lead.status === 'approved') return { error: 'Lead já aprovado.' }

    const { error } = await supabaseAdmin
        .from('leads')
        .update({ status: 'rejected', notes: reason ?? null })
        .eq('id', leadId)
    if (error) return { error: 'Falha ao rejeitar lead.' }

    await logAdminAction({
        adminEmail,
        action: 'reject_lead',
        targetType: 'lead',
        targetId: leadId,
        metadata: { reason: reason ?? null },
        ipAddress,
    })
    await trackAdminEvent('lead_rejected', {
        metadata: { lead_id: leadId, reason: reason ?? null },
    })

    revalidatePath(`${config.panelBasePath}/leads`)
    revalidatePath(`${config.panelBasePath}/leads/${leadId}`)
    return { ok: true }
}

export async function markContactedAction(leadId: string): Promise<RejectLeadResult> {
    const guard = await requireStaff()
    if ('error' in guard) return { error: guard.error }

    const { error } = await supabaseAdmin
        .from('leads')
        .update({ status: 'contacted' })
        .eq('id', leadId)
        .in('status', ['new'])
    if (error) return { error: 'Falha ao atualizar.' }

    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'mark_contacted',
        targetType: 'lead',
        targetId: leadId,
    })

    revalidatePath(`${config.panelBasePath}/leads`)
    revalidatePath(`${config.panelBasePath}/leads/${leadId}`)
    return { ok: true }
}
