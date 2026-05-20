'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { sendSetupEmail } from '@/lib/admin-leads-control-hub/email'
import { provisionLeadAccount } from '@/lib/admin-leads-control-hub/provision-lead-account'
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
}

export interface RejectLeadResult {
    ok?: boolean
    error?: string
}

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
        console.error('[approveLeadAction] provisionLeadAccount failed', err)
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

    if (provisioned.isNewUser) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
        try {
            const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                type: 'recovery',
                email: lead.email.toLowerCase(),
                options: { redirectTo: `${siteUrl}/reset-password` },
            })
            const setupLink = linkData?.properties?.action_link
            if (setupLink) {
                await sendSetupEmail({
                    to: lead.email.toLowerCase(),
                    setupLink,
                    entityName: provisioned.accountName,
                    leadName: lead.name,
                    trialDays: provisioned.trialDays,
                })
            }
        } catch (err) {
            console.error('[approveLeadAction] generateLink/sendEmail error', err)
        }
    }

    revalidatePath(`${config.panelBasePath}/leads`)
    revalidatePath(`${config.panelBasePath}/leads/${leadId}`)
    return { ok: true, entityId: provisioned.accountId }
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
