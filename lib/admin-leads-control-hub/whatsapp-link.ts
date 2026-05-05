import type { LeadControlHubConfig } from './types'

export function buildLeadInboundWhatsappLink(
    config: LeadControlHubConfig,
    args: { lead: { name: string; organization_name: string; custom_fields?: Record<string, unknown> } }
): string {
    const phone = config.whatsappAdminNumber
    const text = config.whatsappTemplate
        ? config.whatsappTemplate({
              name: args.lead.name,
              organization_name: args.lead.organization_name,
              custom_fields: args.lead.custom_fields ?? {},
          })
        : `Olá! Preenchi o formulário no site e quero conhecer ${config.appName} 😊\n\nNome: ${args.lead.name}\nEmpresa: ${args.lead.organization_name}`
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

export function buildLeadOutboundWhatsappLink(args: {
    leadName: string
    leadPhone: string
    appName: string
    customMessage?: (firstName: string) => string
}): string {
    const digits = args.leadPhone.replace(/\D/g, '')
    const firstName = args.leadName.split(/\s+/)[0] || args.leadName
    const text = args.customMessage
        ? args.customMessage(firstName)
        : `Olá, ${firstName}! Aqui é da equipe ${args.appName} 👋\n\nPosso te mostrar como funciona em poucos minutos?`
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function buildApprovalWhatsappLink(args: {
    leadName: string
    leadPhone: string
    isNewUser: boolean
    loginUrl: string
    entityName: string
    appName: string
}): string {
    const digits = args.leadPhone.replace(/\D/g, '')
    const firstName = args.leadName.split(/\s+/)[0] || args.leadName
    const text = args.isNewUser
        ? `Olá, ${firstName}! Sua conta no ${args.appName} foi criada 🎉\n\nEnviamos um email com o link para definir sua senha e acessar.\nLogin: ${args.loginUrl}`
        : `Olá, ${firstName}! Vinculamos um novo ${args.entityName} à sua conta no ${args.appName} 🎉\n\nAcesse com seu login atual: ${args.loginUrl}`
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
