import { Resend } from 'resend'

let cached: Resend | null = null

export function getResendClient(): Resend {
    if (cached) return cached
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY ausente')
    cached = new Resend(apiKey)
    return cached
}

export function getResendFrom(): string {
    const from = process.env.RESEND_FROM
    if (!from) throw new Error('RESEND_FROM ausente')
    return from
}
