'use server'

import { renderActionEmail } from '@/lib/email/templates'
import { sendRecoveryEmail } from '@/lib/email/send-recovery-email'
import { trackAuthEvent } from '@/lib/analytics/track-event'

export interface ForgotPasswordResult {
    ok?: boolean
    error?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function requestPasswordResetAction(emailRaw: string): Promise<ForgotPasswordResult> {
    const email = (emailRaw ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
        return { ok: true }
    }

    const result = await sendRecoveryEmail({
        email,
        renderHtml: (actionLink) => ({
            subject: 'Redefinir senha — Ordem na Mesa',
            html: renderActionEmail({
                title: 'Redefinir senha',
                greeting: 'Olá!',
                bodyHtml: `
                  <p>Recebemos uma solicitação para redefinir a senha da sua conta no Ordem na Mesa.</p>
                  <p>Clique no botão abaixo para escolher uma nova senha. Esse link expira em 1 hora.</p>
                `,
                ctaLabel: 'Redefinir minha senha',
                ctaUrl: actionLink,
                footerNote: 'Se você não solicitou, pode ignorar este email — sua senha continua a mesma.',
            }),
        }),
        logContext: { source: 'requestPasswordResetAction', email },
    })

    if (result.ok) {
        await trackAuthEvent('password_reset_requested', { metadata: { source: 'forgot_password' } })
    }

    return { ok: true }
}
