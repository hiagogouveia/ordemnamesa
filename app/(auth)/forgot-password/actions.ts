'use server'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send-email'
import { renderActionEmail } from '@/lib/email/templates'
import { trackAuthEvent } from '@/lib/analytics/track-event'

export interface ForgotPasswordResult {
    ok?: boolean
    error?: string
}

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient {
    if (_admin) return _admin
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase admin envs ausentes')
    _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return _admin
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function requestPasswordResetAction(emailRaw: string): Promise<ForgotPasswordResult> {
    const email = (emailRaw ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
        return { ok: true }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) {
        console.error('[requestPasswordResetAction] NEXT_PUBLIC_SITE_URL ausente')
        return { ok: true }
    }

    try {
        const { data, error } = await getAdmin().auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: `${siteUrl}/reset-password` },
        })

        if (error) {
            console.error('[requestPasswordResetAction] generateLink', { email, msg: error.message })
            return { ok: true }
        }

        const actionLink = data?.properties?.action_link
        if (!actionLink) return { ok: true }

        const html = renderActionEmail({
            title: 'Redefinir senha',
            greeting: 'Olá!',
            bodyHtml: `
              <p>Recebemos uma solicitação para redefinir a senha da sua conta no Ordem na Mesa.</p>
              <p>Clique no botão abaixo para escolher uma nova senha. Esse link expira em 1 hora.</p>
            `,
            ctaLabel: 'Redefinir minha senha',
            ctaUrl: actionLink,
            footerNote: 'Se você não solicitou, pode ignorar este email — sua senha continua a mesma.',
        })

        const result = await sendEmail({
            to: email,
            subject: 'Redefinir senha — Ordem na Mesa',
            html,
        })
        if (!result.ok) {
            console.error('[requestPasswordResetAction] sendEmail', { email, error: result.error })
        }

        await trackAuthEvent('password_reset_requested', { metadata: { source: 'forgot_password' } })
    } catch (err) {
        console.error('[requestPasswordResetAction] exception', err instanceof Error ? err.message : err)
    }

    return { ok: true }
}
