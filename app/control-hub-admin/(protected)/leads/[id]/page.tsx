import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { config } from '@/lead-control-hub.config'
import {
    computeLeadTemperature,
    LEAD_TEMPERATURE_CONFIG,
    LEAD_TEMPERATURE_PLAYBOOK,
} from '@/lib/admin-leads-control-hub/lead-scoring'
import {
    buildLeadOutboundWhatsappLink,
    buildApprovalWhatsappLink,
} from '@/lib/admin-leads-control-hub/whatsapp-link'
import type { Lead } from '@/lib/admin-leads-control-hub/types'
import { LeadActions } from './lead-actions'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const { data, error } = await supabaseAdmin.from('leads').select('*').eq('id', id).single()
    if (error || !data) notFound()
    const lead = data as Lead

    const temperature = computeLeadTemperature(config, lead)
    const tConfig = LEAD_TEMPERATURE_CONFIG[temperature]
    const playbook = LEAD_TEMPERATURE_PLAYBOOK[temperature]

    const outboundWa = buildLeadOutboundWhatsappLink({
        leadName: lead.name,
        leadPhone: lead.phone,
        appName: config.appName,
    })

    const approvalWa = buildApprovalWhatsappLink({
        leadName: lead.name,
        leadPhone: lead.phone,
        isNewUser: true,
        loginUrl: process.env.NEXT_PUBLIC_SITE_URL ?? '',
        entityName: lead.organization_name,
        appName: config.appName,
    })

    return (
        <div className="space-y-6">
            <Link
                href={`${config.panelBasePath}/leads`}
                className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-primary"
            >
                ← Voltar para leads
            </Link>

            <div className="rounded-2xl border border-border-dark bg-surface-dark p-6 sm:p-8">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${tConfig.cls}`}>
                        {tConfig.emoji} {tConfig.label}
                    </span>
                    <span className="rounded-md border border-border-dark bg-surface-deep px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-text-secondary">
                        {lead.status}
                    </span>
                    <span className="text-xs text-text-secondary">
                        {new Date(lead.created_at).toLocaleString('pt-BR')}
                    </span>
                </div>

                <h1 className="text-3xl font-black text-white">{lead.organization_name}</h1>
                <div className="mt-1 text-text-secondary">{lead.name}</div>

                <div className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    <Field label="E-mail" value={lead.email} />
                    <Field label="WhatsApp" value={lead.phone} />
                    {lead.city && <Field label="Cidade" value={lead.city} />}
                    {lead.state && <Field label="UF" value={lead.state} />}
                </div>

                {Object.keys(lead.custom_fields).length > 0 && (
                    <div className="mt-6 rounded-xl border border-border-dark bg-surface-deep p-5">
                        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">
                            Qualificação
                        </div>
                        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                            {config.customFields.map((f) => {
                                const raw = lead.custom_fields[f.name]
                                if (raw === undefined || raw === null || raw === '') return null
                                const display =
                                    f.options?.find((o) => o.value === String(raw))?.label ?? String(raw)
                                return (
                                    <div key={f.name}>
                                        <dt className="text-xs font-semibold text-text-secondary">
                                            {f.label ?? f.name}
                                        </dt>
                                        <dd className="mt-0.5 text-white">{display}</dd>
                                    </div>
                                )
                            })}
                        </dl>
                    </div>
                )}

                <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5 text-sm">
                    <div className="font-bold text-primary">{playbook.headline}</div>
                    <div className="mt-1 text-xs text-text-secondary">{playbook.description}</div>
                </div>
            </div>

            <div className="rounded-2xl border border-border-dark bg-surface-dark p-6">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">Ações</h2>
                <div className="flex flex-wrap gap-2">
                    <a
                        href={outboundWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-bold text-white shadow-xl shadow-success/30 transition-all duration-200 hover:scale-[1.02] hover:bg-success/90"
                    >
                        💬 WhatsApp (abordagem)
                    </a>
                    <a
                        href={approvalWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-5 py-3 text-sm font-bold text-success transition-colors hover:bg-success/15"
                    >
                        💬 WhatsApp (pós-aprovação)
                    </a>
                    <LeadActions leadId={lead.id} status={lead.status} />
                </div>
            </div>

            {lead.notes && (
                <div className="rounded-2xl border border-border-dark bg-surface-dark p-6 text-sm text-white">
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">Notas</div>
                    {lead.notes}
                </div>
            )}
        </div>
    )
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs font-semibold text-text-secondary">{label}</div>
            <div className="text-white">{value}</div>
        </div>
    )
}
