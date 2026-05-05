import { Resend } from 'resend'

function getResend(): Resend {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY ausente')
    return new Resend(key)
}

export async function sendSetupEmail(args: {
    to: string
    setupLink: string
    entityName: string
    leadName: string
}): Promise<void> {
    const { to, setupLink, entityName, leadName } = args
    const from = process.env.RESEND_FROM ?? 'Ordem na Mesa <noreply@ordemnamesa.com>'
    const firstName = leadName.split(/\s+/)[0] || leadName

    await getResend().emails.send({
        from,
        to,
        subject: `Bem-vindo ao Ordem na Mesa — ${entityName}`,
        html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <h1 style="font-size:20px;margin:0 0 16px">Olá, ${firstName}!</h1>
    <p>Seu restaurante <strong>${entityName}</strong> foi aprovado no <strong>Ordem na Mesa</strong>.</p>
    <p>Clique no botão abaixo para definir sua senha e acessar a plataforma:</p>
    <p style="margin:24px 0">
        <a href="${setupLink}"
           style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
           Definir senha e acessar
        </a>
    </p>
    <p style="color:#666;font-size:13px">O link expira em 24 horas. Se não foi você, ignore este email.</p>
</div>`,
    })
}
