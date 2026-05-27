import { renderActionEmail } from '@/lib/email/templates'

export interface RenderSetupEmailArgs {
    setupLink: string
    entityName: string
    leadName: string
    trialDays?: number
}

export function renderSetupEmail(args: RenderSetupEmailArgs): { subject: string; html: string } {
    const { setupLink, entityName, leadName, trialDays } = args
    const firstName = leadName.split(/\s+/)[0] || leadName
    const trialBlock = trialDays && trialDays > 0
        ? `<p>Seu período de teste de <strong>${trialDays} ${trialDays === 1 ? 'dia' : 'dias'}</strong> começa agora.</p>`
        : ''

    const subject = `Bem-vindo ao Ordem na Mesa — ${entityName}`
    const html = renderActionEmail({
        title: `Bem-vindo ao Ordem na Mesa — ${entityName}`,
        greeting: `Olá, <strong>${firstName}</strong>!`,
        bodyHtml: `
          <p>Seu restaurante <strong>${entityName}</strong> foi aprovado.</p>
          ${trialBlock}
          <p>Para começar, defina sua senha de acesso clicando no botão abaixo.</p>
        `,
        ctaLabel: 'Definir senha e acessar',
        ctaUrl: setupLink,
        footerNote: 'O link expira em 24 horas. Se não foi você, ignore este email.',
    })
    return { subject, html }
}
