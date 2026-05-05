import { sendEmail } from '@/lib/email/send-email'
import { renderActionEmail } from '@/lib/email/templates'

export async function sendSetupEmail(args: {
    to: string
    setupLink: string
    entityName: string
    leadName: string
}): Promise<void> {
    const { to, setupLink, entityName, leadName } = args
    const firstName = leadName.split(/\s+/)[0] || leadName

    const html = renderActionEmail({
        title: `Bem-vindo ao Ordem na Mesa — ${entityName}`,
        greeting: `Olá, <strong>${firstName}</strong>!`,
        bodyHtml: `
          <p>Seu restaurante <strong>${entityName}</strong> foi aprovado.</p>
          <p>Para começar, defina sua senha de acesso clicando no botão abaixo.</p>
        `,
        ctaLabel: 'Definir senha e acessar',
        ctaUrl: setupLink,
        footerNote: 'O link expira em 24 horas. Se não foi você, ignore este email.',
    })

    const result = await sendEmail({
        to,
        subject: `Bem-vindo ao Ordem na Mesa — ${entityName}`,
        html,
    })
    if (!result.ok) {
        throw new Error(`Falha ao enviar email de setup: ${result.error ?? 'desconhecido'}`)
    }
}
