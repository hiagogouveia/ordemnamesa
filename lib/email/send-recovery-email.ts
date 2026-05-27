import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './send-email'

export type RecoveryEmailFailure =
    | 'site_url_missing'
    | 'admin_envs_missing'
    | 'generate_link'
    | 'empty_link'
    | 'send_email'

export type SendRecoveryEmailResult =
    | { ok: true; messageId?: string; actionLink: string }
    | { ok: false; reason: RecoveryEmailFailure; error?: string }

export interface SendRecoveryEmailArgs {
    email: string
    renderHtml: (actionLink: string) => { subject: string; html: string }
    logContext: Record<string, unknown>
}

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
    if (_admin) return _admin
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return _admin
}

function logError(reason: RecoveryEmailFailure, context: Record<string, unknown>, error?: unknown) {
    const errMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[sendRecoveryEmail]', { reason, ...context, error: errMsg, stack })
}

export async function sendRecoveryEmail(
    args: SendRecoveryEmailArgs
): Promise<SendRecoveryEmailResult> {
    const { email, renderHtml, logContext } = args
    const normalizedEmail = email.toLowerCase().trim()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) {
        logError('site_url_missing', { ...logContext, email: normalizedEmail })
        return { ok: false, reason: 'site_url_missing', error: 'NEXT_PUBLIC_SITE_URL não configurado.' }
    }

    const admin = getAdmin()
    if (!admin) {
        logError('admin_envs_missing', { ...logContext, email: normalizedEmail })
        return { ok: false, reason: 'admin_envs_missing', error: 'Variáveis Supabase admin ausentes.' }
    }

    let actionLink: string | undefined
    try {
        const { data, error } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: { redirectTo: `${siteUrl}/reset-password` },
        })
        if (error) {
            logError('generate_link', { ...logContext, email: normalizedEmail }, error)
            return { ok: false, reason: 'generate_link', error: error.message }
        }
        actionLink = data?.properties?.action_link
    } catch (err) {
        logError('generate_link', { ...logContext, email: normalizedEmail }, err)
        return {
            ok: false,
            reason: 'generate_link',
            error: err instanceof Error ? err.message : 'erro desconhecido em generateLink',
        }
    }

    if (!actionLink) {
        logError('empty_link', { ...logContext, email: normalizedEmail })
        return { ok: false, reason: 'empty_link', error: 'action_link vazio retornado por generateLink.' }
    }

    const { subject, html } = renderHtml(actionLink)
    const sent = await sendEmail({ to: normalizedEmail, subject, html })
    if (!sent.ok) {
        logError('send_email', { ...logContext, email: normalizedEmail, subject }, sent.error)
        return { ok: false, reason: 'send_email', error: sent.error }
    }

    return { ok: true, messageId: sent.id, actionLink }
}
