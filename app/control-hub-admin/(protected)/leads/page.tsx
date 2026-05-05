import Link from 'next/link'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import {
    computeLeadTemperature,
    LEAD_TEMPERATURE_CONFIG,
    compareByTemperature,
    type LeadTemperature,
} from '@/lib/admin-leads-control-hub/lead-scoring'
import { config } from '@/lead-control-hub.config'
import type { Lead } from '@/lib/admin-leads-control-hub/types'

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
    return (
        <Link
            href={`${config.panelBasePath}/leads/${lead.id}`}
            className="block rounded-2xl border border-border-dark bg-surface-dark p-5 transition-colors duration-200 hover:border-primary/40"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${t.cls}`}>
                            {t.emoji} {t.label}
                        </span>
                        <StatusBadge status={lead.status} />
                    </div>
                    <div className="mt-2 truncate text-base font-bold text-white">{lead.organization_name}</div>
                    <div className="text-sm text-text-secondary">
                        {lead.name} · {lead.email}
                    </div>
                </div>
                <div className="text-xs text-text-secondary">
                    {new Date(lead.created_at).toLocaleString('pt-BR')}
                </div>
            </div>
        </Link>
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
