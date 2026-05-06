'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff, requireSuperAdmin } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { sendEmail } from '@/lib/email/send-email'
import { renderActionEmail } from '@/lib/email/templates'
import { config } from '@/lead-control-hub.config'

export interface AdminActionResult {
    ok?: boolean
    error?: string
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

    revalidatePath(`${config.panelBasePath}/restaurants/${restaurantId}`)
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
