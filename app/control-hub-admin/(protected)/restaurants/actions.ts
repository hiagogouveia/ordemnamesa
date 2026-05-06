'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff, requireSuperAdmin } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { sendEmail } from '@/lib/email/send-email'
import { renderActionEmail } from '@/lib/email/templates'
import { config } from '@/lead-control-hub.config'
import { trackAdminEvent } from '@/lib/analytics/track-event'

export interface AdminActionResult {
    ok?: boolean
    error?: string
}

async function captureRequestContext() {
    const h = await headers()
    return {
        ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
        userAgent: h.get('user-agent') || null,
    }
}

async function loadRestaurantWithAccount(restaurantId: string) {
    const { data: restaurant } = await supabaseAdmin
        .from('restaurants')
        .select('id, name, account_id')
        .eq('id', restaurantId)
        .maybeSingle<{ id: string; name: string; account_id: string }>()
    if (!restaurant) return { error: 'Restaurante não encontrado.' as const }
    return { restaurant }
}

function revalidateRestaurant(restaurantId: string) {
    revalidatePath(`${config.panelBasePath}/restaurants`)
    revalidatePath(`${config.panelBasePath}/restaurants/${restaurantId}`)
}

export async function resetOwnerPasswordAction(
    restaurantId: string
): Promise<AdminActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }
    const adminEmail = guard.ctx.user.email!.toLowerCase()

    const h = await headers()
    const ipAddress = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    const userAgent = h.get('user-agent') || null

    const { data: restaurant } = await supabaseAdmin
        .from('restaurants')
        .select('id, name, owner_id')
        .eq('id', restaurantId)
        .maybeSingle<{ id: string; name: string; owner_id: string }>()
    if (!restaurant) return { error: 'Restaurante não encontrado.' }

    const { data: owner } = await supabaseAdmin
        .from('users')
        .select('id, email, name')
        .eq('id', restaurant.owner_id)
        .maybeSingle<{ id: string; email: string; name: string | null }>()
    if (!owner?.email) return { error: 'Owner do restaurante não encontrado.' }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: owner.email,
        options: { redirectTo: `${siteUrl}/reset-password` },
    })
    if (linkError || !linkData?.properties?.action_link) {
        console.error('[resetOwnerPasswordAction] generateLink', linkError)
        return { error: 'Falha ao gerar link de recuperação.' }
    }

    const setupLink = linkData.properties.action_link
    const firstName = owner.name?.split(/\s+/)[0] ?? owner.name ?? 'olá'
    const html = renderActionEmail({
        title: `Redefinição de senha — ${config.appName}`,
        greeting: `Olá, <strong>${firstName}</strong>!`,
        bodyHtml: `
          <p>A equipe administrativa do <strong>${config.appName}</strong> gerou um novo link para você redefinir a senha de acesso ao restaurante <strong>${restaurant.name}</strong>.</p>
          <p>Clique no botão abaixo para definir uma nova senha.</p>
        `,
        ctaLabel: 'Redefinir senha',
        ctaUrl: setupLink,
        footerNote: 'O link expira em 24 horas. Se não foi você quem solicitou, ignore este email.',
    })

    const sent = await sendEmail({
        to: owner.email,
        subject: `Redefinição de senha — ${config.appName}`,
        html,
    })
    if (!sent.ok) {
        console.error('[resetOwnerPasswordAction] sendEmail', sent.error)
        return { error: 'Link gerado, mas falhou ao enviar o email. Verifique os logs.' }
    }

    await logAdminAction({
        adminEmail,
        action: 'manual_password_reset',
        targetType: 'user',
        targetId: owner.id,
        metadata: {
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name,
            owner_email: owner.email,
        },
        ipAddress,
        userAgent,
    })
    await trackAdminEvent('manual_password_reset', {
        restaurantId: restaurant.id,
        userId: owner.id,
        metadata: { triggered_by: adminEmail },
    })

    revalidatePath(`${config.panelBasePath}/restaurants/${restaurantId}`)
    return { ok: true }
}

export async function suspendAccountAction(
    restaurantId: string,
    reason: string
): Promise<AdminActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }
    const trimmed = reason.trim()
    if (trimmed.length < 3) return { error: 'Motivo da suspensão é obrigatório (mínimo 3 caracteres).' }

    const loaded = await loadRestaurantWithAccount(restaurantId)
    if ('error' in loaded) return { error: loaded.error }
    const { restaurant } = loaded

    const { data: before } = await supabaseAdmin
        .from('accounts')
        .select('active')
        .eq('id', restaurant.account_id)
        .maybeSingle<{ active: boolean }>()

    const { error } = await supabaseAdmin
        .from('accounts')
        .update({
            active: false,
            suspended_at: new Date().toISOString(),
            suspended_reason: trimmed,
        })
        .eq('id', restaurant.account_id)
    if (error) return { error: `Falha ao suspender: ${error.message}` }

    const ctx = await captureRequestContext()
    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'suspend_account',
        targetType: 'account',
        targetId: restaurant.account_id,
        metadata: {
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name,
            reason: trimmed,
            previous_active: before?.active ?? null,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
    })
    await trackAdminEvent('account_suspended', {
        accountId: restaurant.account_id,
        restaurantId: restaurant.id,
        metadata: { reason: trimmed, by: guard.ctx.user.email?.toLowerCase() ?? null },
    })
    revalidateRestaurant(restaurantId)
    return { ok: true }
}

export async function reactivateAccountAction(
    restaurantId: string
): Promise<AdminActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const loaded = await loadRestaurantWithAccount(restaurantId)
    if ('error' in loaded) return { error: loaded.error }
    const { restaurant } = loaded

    const { error } = await supabaseAdmin
        .from('accounts')
        .update({ active: true, suspended_at: null, suspended_reason: null })
        .eq('id', restaurant.account_id)
    if (error) return { error: `Falha ao reativar: ${error.message}` }

    const ctx = await captureRequestContext()
    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'reactivate_account',
        targetType: 'account',
        targetId: restaurant.account_id,
        metadata: { restaurant_id: restaurant.id, restaurant_name: restaurant.name },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
    })
    await trackAdminEvent('account_reactivated', {
        accountId: restaurant.account_id,
        restaurantId: restaurant.id,
        metadata: { by: guard.ctx.user.email?.toLowerCase() ?? null },
    })
    revalidateRestaurant(restaurantId)
    return { ok: true }
}

export async function extendTrialAction(
    restaurantId: string,
    days: number
): Promise<AdminActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }
    if (!Number.isFinite(days) || days <= 0 || days > 90) {
        return { error: 'Número de dias inválido (1–90).' }
    }

    const loaded = await loadRestaurantWithAccount(restaurantId)
    if ('error' in loaded) return { error: loaded.error }
    const { restaurant } = loaded

    const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status, ends_at')
        .eq('account_id', restaurant.account_id)
        .maybeSingle<{ id: string; status: string; ends_at: string | null }>()
    if (!sub) return { error: 'Assinatura não encontrada para esta account.' }
    if (sub.status !== 'trial') return { error: 'Só é possível estender quando o status é trial.' }

    const base = sub.ends_at ? new Date(sub.ends_at) : new Date()
    const baseMs = Number.isFinite(base.getTime()) ? base.getTime() : Date.now()
    const newEnds = new Date(Math.max(baseMs, Date.now()) + days * 86_400_000).toISOString()

    const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({ ends_at: newEnds })
        .eq('id', sub.id)
    if (error) return { error: `Falha ao estender trial: ${error.message}` }

    const ctx = await captureRequestContext()
    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'extend_trial',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: {
            account_id: restaurant.account_id,
            restaurant_id: restaurant.id,
            days,
            before_ends_at: sub.ends_at,
            after_ends_at: newEnds,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
    })
    await trackAdminEvent('trial_extended', {
        accountId: restaurant.account_id,
        restaurantId: restaurant.id,
        metadata: { days, before_ends_at: sub.ends_at, after_ends_at: newEnds },
    })
    revalidateRestaurant(restaurantId)
    return { ok: true }
}

export async function changePlanAction(
    restaurantId: string,
    planId: string,
    billingCycle: 'monthly' | 'yearly'
): Promise<AdminActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }
    if (!['monthly', 'yearly'].includes(billingCycle)) {
        return { error: 'Ciclo de cobrança inválido.' }
    }

    const loaded = await loadRestaurantWithAccount(restaurantId)
    if ('error' in loaded) return { error: loaded.error }
    const { restaurant } = loaded

    const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('id, code, name')
        .eq('id', planId)
        .eq('active', true)
        .maybeSingle<{ id: string; code: string; name: string }>()
    if (!plan) return { error: 'Plano não encontrado ou inativo.' }

    const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('id, plan_id, billing_cycle')
        .eq('account_id', restaurant.account_id)
        .maybeSingle<{ id: string; plan_id: string; billing_cycle: string }>()
    if (!sub) return { error: 'Assinatura não encontrada.' }

    const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({ plan_id: plan.id, billing_cycle: billingCycle })
        .eq('id', sub.id)
    if (error) return { error: `Falha ao alterar plano: ${error.message}` }

    const ctx = await captureRequestContext()
    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'change_plan',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: {
            account_id: restaurant.account_id,
            restaurant_id: restaurant.id,
            before_plan_id: sub.plan_id,
            after_plan_id: plan.id,
            after_plan_code: plan.code,
            before_cycle: sub.billing_cycle,
            after_cycle: billingCycle,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
    })
    await trackAdminEvent('plan_changed', {
        accountId: restaurant.account_id,
        restaurantId: restaurant.id,
        metadata: {
            before_plan_id: sub.plan_id,
            after_plan_id: plan.id,
            after_plan_code: plan.code,
            before_cycle: sub.billing_cycle,
            after_cycle: billingCycle,
        },
    })
    revalidateRestaurant(restaurantId)
    return { ok: true }
}

export async function toggleVipAction(
    restaurantId: string,
    vip: boolean
): Promise<AdminActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const loaded = await loadRestaurantWithAccount(restaurantId)
    if ('error' in loaded) return { error: loaded.error }
    const { restaurant } = loaded

    const { data: account } = await supabaseAdmin
        .from('accounts')
        .select('metadata')
        .eq('id', restaurant.account_id)
        .maybeSingle<{ metadata: Record<string, unknown> | null }>()
    const nextMetadata = { ...(account?.metadata ?? {}), vip }

    const { error } = await supabaseAdmin
        .from('accounts')
        .update({ metadata: nextMetadata })
        .eq('id', restaurant.account_id)
    if (error) return { error: `Falha ao atualizar VIP: ${error.message}` }

    const ctx = await captureRequestContext()
    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'toggle_vip',
        targetType: 'account',
        targetId: restaurant.account_id,
        metadata: { restaurant_id: restaurant.id, vip },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
    })
    await trackAdminEvent('vip_toggled', {
        accountId: restaurant.account_id,
        restaurantId: restaurant.id,
        metadata: { vip },
    })
    revalidateRestaurant(restaurantId)
    return { ok: true }
}

export async function logRestaurantViewAction(restaurantId: string): Promise<AdminActionResult> {
    const guard = await requireStaff()
    if ('error' in guard) return { error: guard.error }
    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'view_restaurant_admin',
        targetType: 'restaurant',
        targetId: restaurantId,
    })
    return { ok: true }
}
