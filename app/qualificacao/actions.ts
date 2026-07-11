'use server'

import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { config } from '@/lead-control-hub.config'
import { buildLeadInboundWhatsappLink } from '@/lib/admin-leads-control-hub/whatsapp-link'
import { enqueueAdminNotification } from '@/lib/admin-notifications/enqueue'
import { processAdminNotificationOutbox } from '@/lib/admin-notifications/process'
import type { Lead } from '@/lib/admin-leads-control-hub/types'

export interface SubmitLeadResult {
    ok?: boolean
    error?: string
    whatsappUrl?: string
}

export async function submitLeadAction(
    _prev: SubmitLeadResult | null,
    formData: FormData
): Promise<SubmitLeadResult> {
    const name = (formData.get('name') as string | null)?.trim() || ''
    const organizationName = (formData.get('organizationName') as string | null)?.trim() || ''
    const email = (formData.get('email') as string | null)?.trim().toLowerCase() || ''
    const phoneRaw = (formData.get('phone') as string | null) || ''
    const city = (formData.get('city') as string | null)?.trim() || ''
    const state = (formData.get('state') as string | null)?.trim() || ''
    const cnpjRaw = (formData.get('cnpj') as string | null)?.trim() || ''

    if (!name || !organizationName || !email || !phoneRaw) {
        return { error: 'Preencha todos os campos obrigatórios.' }
    }

    let cnpjDigits = ''
    if (cnpjRaw) {
        cnpjDigits = cnpjRaw.replace(/\D/g, '')
        if (cnpjDigits.length !== 14) {
            return { error: 'CNPJ inválido. Informe os 14 dígitos.' }
        }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: 'E-mail inválido.' }
    }

    const phoneDigits = phoneRaw.replace(/\D/g, '')
    const fullPhone = phoneDigits.length === 11 ? `55${phoneDigits}` : phoneDigits
    if (!/^55\d{11}$/.test(fullPhone)) {
        return { error: 'Número de WhatsApp inválido. Use DDD + número (11 dígitos).' }
    }

    const custom_fields: Record<string, unknown> = {}
    for (const field of config.customFields) {
        const raw = formData.get(field.name)
        const labelForError = field.label ?? field.name
        if (raw === null || raw === '') {
            if (field.required) return { error: `Campo "${labelForError}" é obrigatório.` }
            continue
        }
        if (field.type === 'segmented' || field.type === 'select') {
            const allowed = field.options?.map((o) => o.value) ?? []
            if (!allowed.includes(String(raw))) {
                return { error: `Valor inválido para "${labelForError}".` }
            }
        }
        if (field.type === 'textarea') {
            const trimmed = String(raw).trim().slice(0, 2000)
            if (!trimmed) continue
            custom_fields[field.name] = trimmed
            continue
        }
        custom_fields[field.name] = raw
    }

    const leadSourceRaw = (formData.get('lead_source') as string | null)?.trim() || ''
    const leadSource = leadSourceRaw.slice(0, 100) || 'organic'
    custom_fields.lead_source = leadSource

    if (cnpjDigits) {
        custom_fields.cnpj = cnpjDigits
    }

    const { data: lead, error } = await supabaseAdmin
        .from('leads')
        .insert({
            name,
            organization_name: organizationName,
            email,
            phone: fullPhone,
            city: city || null,
            state: state || null,
            custom_fields,
            status: 'new',
        })
        .select('id, name, organization_name, custom_fields, created_at')
        .single<{ id: string; name: string; organization_name: string; custom_fields: Record<string, unknown>; created_at: string }>()

    if (error || !lead) {
        console.error('[submitLeadAction] insert error', error)
        return { error: 'Não foi possível registrar sua solicitação. Tente novamente.' }
    }

    // Notifica os destinatários administrativos inscritos em "new_lead" (fire-safe:
    // enqueue nunca lança; envio real roda em after(), pós-resposta, sem bloquear o lead).
    const scoringLead = { custom_fields: lead.custom_fields } as Lead
    const score: 'quente' | 'frio' | 'neutro' = config.leadScoring?.hot?.(scoringLead)
        ? 'quente'
        : config.leadScoring?.cold?.(scoringLead)
            ? 'frio'
            : 'neutro'

    await enqueueAdminNotification('new_lead', lead.id, {
        leadId: lead.id,
        name,
        organizationName,
        email,
        phone: fullPhone,
        city: city || null,
        state: state || null,
        cnpj: cnpjDigits || null,
        leadSource,
        score,
        customFields: lead.custom_fields ?? {},
        createdAt: lead.created_at,
    })
    after(() => processAdminNotificationOutbox({ limit: 20 }))

    const whatsappUrl = buildLeadInboundWhatsappLink(config, {
        lead: {
            name: lead.name,
            organization_name: lead.organization_name,
            custom_fields: lead.custom_fields ?? {},
        },
    })

    return { ok: true, whatsappUrl }
}
