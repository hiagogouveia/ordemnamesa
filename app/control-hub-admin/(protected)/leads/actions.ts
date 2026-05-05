'use server'

import crypto from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { sendSetupEmail } from '@/lib/admin-leads-control-hub/email'
import { config } from '@/lead-control-hub.config'
import type { Lead } from '@/lib/admin-leads-control-hub/types'

export interface ApproveLeadResult {
    ok?: boolean
    error?: string
    entityId?: string
}

export interface RejectLeadResult {
    ok?: boolean
    error?: string
}

async function findExistingUserByEmail(email: string): Promise<User | null> {
    let page = 1
    while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
        if (error) return null
        const found = data.users.find(
            (u) => (u.email ?? '').toLowerCase() === email.toLowerCase()
        )
        if (found) return found
        if (data.users.length < 200) return null
        page += 1
        if (page > 25) return null
    }
}

function generateThrowawayPassword(): string {
    return crypto.randomBytes(24).toString('base64url') + 'Aa1!'
}

export async function approveLeadAction(leadId: string): Promise<ApproveLeadResult> {
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

    const email = lead.email.toLowerCase()
    const existing = await findExistingUserByEmail(email)
    const isNewUser = !existing

    let userId: string
    if (existing) {
        userId = existing.id
    } else {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: generateThrowawayPassword(),
            email_confirm: true,
            user_metadata: { full_name: lead.name },
        })
        if (error || !data?.user) {
            console.error('[approveLeadAction] createUser error', error)
            return { error: 'Falha ao criar usuário.' }
        }
        userId = data.user.id
    }

    let entityResult
    try {
        entityResult = await config.createEntityFromLead({
            lead,
            userId,
            isNewUser,
            supabaseAdmin,
        })
    } catch (err) {
        console.error('[approveLeadAction] createEntityFromLead failed', err)
        if (isNewUser) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
        return { error: 'Falha ao criar restaurante.' }
    }

    await supabaseAdmin
        .from('leads')
        .update({
            status: 'approved',
            approved_entity_id: entityResult.entityId,
            approved_user_id: userId,
        })
        .eq('id', leadId)

    await logAdminAction({
        adminEmail,
        action: 'approve_lead',
        targetType: 'lead',
        targetId: leadId,
        metadata: { isNewUser, entityId: entityResult.entityId, entityName: entityResult.entityName },
        ipAddress,
        userAgent,
    })

    if (isNewUser) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
        try {
            const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                type: 'recovery',
                email,
                options: { redirectTo: `${siteUrl}/reset-password` },
            })
            const setupLink = linkData?.properties?.action_link
            if (setupLink) {
                await sendSetupEmail({
                    to: email,
                    setupLink,
                    entityName: entityResult.entityName,
                    leadName: lead.name,
                })
            }
        } catch (err) {
            console.error('[approveLeadAction] generateLink/sendEmail error', err)
        }
    }

    revalidatePath(`${config.panelBasePath}/leads`)
    revalidatePath(`${config.panelBasePath}/leads/${leadId}`)
    return { ok: true, entityId: entityResult.entityId }
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
