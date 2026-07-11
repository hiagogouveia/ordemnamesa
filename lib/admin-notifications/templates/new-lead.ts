import { renderActionEmail } from '@/lib/email/templates'
import { config } from '@/lead-control-hub.config'
import type { NewLeadPayload } from '../types'

/** Resolve o value de um custom field para o label legível definido no config. */
function resolveCustomFieldLabel(fieldName: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—'
    const field = config.customFields.find((f) => f.name === fieldName)
    const option = field?.options?.find((o) => o.value === String(value))
    return option?.label ?? String(value)
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function row(label: string, value: string): string {
    return `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;width:40%">${label}</td>
        <td style="padding:6px 0;font-size:14px;color:#e2e8f0;font-weight:600">${value}</td>
      </tr>`
}

const SCORE_BADGE: Record<NewLeadPayload['score'], string> = {
    quente: '🔥 Quente',
    frio: '❄️ Frio',
    neutro: '• Neutro',
}

/**
 * Monta { subject, html } do e-mail de "novo lead" a partir do snapshot no outbox.
 * Reutiliza o layout base `renderActionEmail` (mesmo do resto do projeto).
 */
export function renderNewLeadEmail(payload: NewLeadPayload): { subject: string; html: string } {
    const {
        leadId,
        name,
        organizationName,
        email,
        phone,
        city,
        state,
        cnpj,
        leadSource,
        score,
        customFields,
        createdAt,
    } = payload

    const location = [city, state].filter(Boolean).join(' / ') || '—'
    const createdAtLabel = new Date(createdAt).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    })
    const observacoes = String(customFields.observacoes ?? '').trim()

    const subject = `${score === 'quente' ? '🔥 ' : ''}Novo lead: ${organizationName}`

    const bodyHtml = `
      <p style="margin:0 0 16px">Um novo restaurante solicitou cadastro no <strong>Ordem na Mesa</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        ${row('Score', SCORE_BADGE[score])}
        ${row('Restaurante', escapeHtml(organizationName))}
        ${row('Responsável', escapeHtml(name))}
        ${row('E-mail', escapeHtml(email))}
        ${row('WhatsApp', escapeHtml(phone))}
        ${row('Cidade / Estado', escapeHtml(location))}
        ${cnpj ? row('CNPJ', escapeHtml(cnpj)) : ''}
        ${row('Categoria', escapeHtml(resolveCustomFieldLabel('categoria_restaurante', customFields.categoria_restaurante)))}
        ${row('Unidades', escapeHtml(resolveCustomFieldLabel('numero_unidades', customFields.numero_unidades)))}
        ${row('Funcionários', escapeHtml(resolveCustomFieldLabel('numero_funcionarios', customFields.numero_funcionarios)))}
        ${row('Mesas', escapeHtml(resolveCustomFieldLabel('numero_mesas', customFields.numero_mesas)))}
        ${row('Origem', escapeHtml(leadSource))}
        ${row('Solicitado em', escapeHtml(createdAtLabel))}
        ${observacoes ? row('Observações', escapeHtml(observacoes)) : ''}
      </table>`

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ordemnamesa.com.br').replace(/\/$/, '')
    const ctaUrl = `${siteUrl}${config.panelBasePath}/leads/${leadId}`

    const html = renderActionEmail({
        title: `Novo lead: ${organizationName}`,
        greeting: 'Uma nova solicitação de cadastro chegou.',
        bodyHtml,
        ctaLabel: 'Ver no Control Hub',
        ctaUrl,
        footerNote: 'Você recebeu este e-mail porque está cadastrado como destinatário de notificações administrativas no Control Hub.',
    })

    return { subject, html }
}
