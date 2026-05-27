import Link from 'next/link'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import {
    computeLeadTemperature,
    LEAD_TEMPERATURE_CONFIG,
    compareByTemperature,
    type LeadTemperature,
} from '@/lib/admin-leads-control-hub/lead-scoring'
import { buildLeadOutboundWhatsappLink } from '@/lib/admin-leads-control-hub/whatsapp-link'
import { config } from '@/lead-control-hub.config'
import type { Lead } from '@/lib/admin-leads-control-hub/types'
import { LeadQuickActions } from './lead-quick-actions'
import { SetupEmailStatus } from './setup-email-status'

export const dynamic = 'force-dynamic'

interface SearchParams {
    status?: string
}

export default async function LeadsListPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>
}) {
    const sp = await searchParams
    const statusFilter = sp.status ?? 'pending'

    let query = supabaseAdmin.from('leads').select('*').order('created_at', { ascending: false })
    if (statusFilter === 'pending') query = query.in('status', ['new', 'contacted'])
    else if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data: leadsRaw, error } = await query
    if (error) {
        return (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
                Erro ao carregar leads: {error.message}
            </div>
        )
    }
    const leads = (leadsRaw ?? []) as Lead[]

    const enriched = leads
        .map((l) => ({ lead: l, temperature: computeLeadTemperature(config, l) }))
        .sort((a, b) =>
            compareByTemperature(
                { temperature: a.temperature, created_at: a.lead.created_at },
                { temperature: b.temperature, created_at: b.lead.created_at }
            )
        )

    const counts = {
        hot: enriched.filter((e) => e.temperature === 'hot').length,
        warm: enriched.filter((e) => e.temperature === 'warm').length,
        cold: enriched.filter((e) => e.temperature === 'cold').length,
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-white">Leads</h1>
                    <p className="text-sm text-text-secondary">
                        {enriched.length} {enriched.length === 1 ? 'lead' : 'leads'} ·{' '}
                        🔥 {counts.hot} quentes · 🟡 {counts.warm} mornos · 🔵 {counts.cold} frios
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <FilterLink current={statusFilter} value="pending" label="Pendentes" />
                    <FilterLink current={statusFilter} value="approved" label="Aprovados" />
                    <FilterLink current={statusFilter} value="rejected" label="Rejeitados" />
                    <FilterLink current={statusFilter} value="all" label="Todos" />
                </div>
            </div>

            {enriched.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-dark bg-surface-dark/50 p-12 text-center">
                    <div className="text-3xl">📭</div>
                    <p className="mt-2 text-sm text-text-secondary">Nenhum lead nesta categoria.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {enriched.map(({ lead, temperature }) => (
                        <LeadRow key={lead.id} lead={lead} temperature={temperature} />
                    ))}
                </div>
            )}
        </div>
    )
}

function FilterLink({ current, value, label }: { current: string; value: string; label: string }) {
    const active = current === value
    return (
        <Link
            href={`${config.panelBasePath}/leads?status=${value}`}
            className={
                active
                    ? 'rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-[#111e22] shadow-[0_2px_8px_0_rgba(19,182,236,0.3)]'
                    : 'rounded-lg border border-border-dark bg-surface-dark px-3 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-white'
            }
        >
            {label}
        </Link>
    )
}

function LeadRow({ lead, temperature }: { lead: Lead; temperature: LeadTemperature }) {
    const t = LEAD_TEMPERATURE_CONFIG[temperature]
    const detailHref = `${config.panelBasePath}/leads/${lead.id}`
    const whatsappUrl = buildLeadOutboundWhatsappLink({
        leadName: lead.name,
        leadPhone: lead.phone,
        appName: config.appName,
    })
    const leadSource = (lead.custom_fields?.lead_source as string | undefined) ?? null

    return (
        <div className="rounded-2xl border border-border-dark bg-surface-dark p-5 transition-colors duration-200 hover:border-primary/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <Link href={detailHref} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${t.cls}`}>
                            {t.emoji} {t.label}
                        </span>
                        <StatusBadge status={lead.status} />
                        {leadSource && leadSource !== 'organic' && (
                            <span className="rounded-md border border-border-dark bg-surface-deep px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                                {leadSource}
                            </span>
                        )}
                    </div>
                    <div className="mt-2 truncate text-base font-bold text-white">{lead.organization_name}</div>
                    <div className="text-sm text-text-secondary">
                        {lead.name} · {lead.email}
                    </div>
                </Link>
                <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-text-secondary">
                        {new Date(lead.created_at).toLocaleString('pt-BR')}
                    </div>
                    <LeadQuickActions
                        leadId={lead.id}
                        status={lead.status}
                        whatsappUrl={whatsappUrl}
                        detailHref={detailHref}
                    />
                </div>
            </div>
            {lead.status === 'approved' && (
                <div className="mt-3 border-t border-border-dark pt-3" onClick={(e) => e.stopPropagation()}>
                    <SetupEmailStatus
                        leadId={lead.id}
                        setupEmailSentAt={lead.setup_email_sent_at}
                        setupEmailLastError={lead.setup_email_last_error}
                        variant="compact"
                    />
                </div>
            )}
        </div>
    )
}

function StatusBadge({ status }: { status: Lead['status'] }) {
    const map: Record<Lead['status'], { label: string; cls: string }> = {
        new: { label: 'Novo', cls: 'bg-surface-deep text-text-secondary border-border-dark' },
        contacted: { label: 'Contatado', cls: 'bg-primary/10 text-primary border-primary/30' },
        approved: { label: 'Aprovado', cls: 'bg-success/15 text-success border-success/30' },
        rejected: { label: 'Rejeitado', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
    }
    const m = map[status]
    return <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${m.cls}`}>{m.label}</span>
}
