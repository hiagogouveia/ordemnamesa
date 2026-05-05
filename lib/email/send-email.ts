import { getResendClient, getResendFrom } from './resend'

export interface SendEmailArgs {
    to: string
    subject: string
    html: string
    replyTo?: string
}

export interface SendEmailResult {
    ok: boolean
    id?: string
    error?: string
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
    const { to, subject, html, replyTo } = args
    try {
        const { data, error } = await getResendClient().emails.send({
            from: getResendFrom(),
            to,
            subject,
            html,
            ...(replyTo ? { replyTo } : {}),
        })
        if (error) {
            console.error('[sendEmail] resend error', { to, subject, error: error.message })
            return { ok: false, error: error.message }
        }
        return { ok: true, id: data?.id }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        console.error('[sendEmail] exception', { to, subject, message })
        return { ok: false, error: message }
    }
}
