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
import { checkLeadDuplicates } from '@/lib/admin-leads-control-hub/duplicate-check'
import { getTrialConfig } from '@/lib/admin-leads-control-hub/trial-config'
import type { Lead } from '@/lib/admin-leads-control-hub/types'
import { LeadActions } from './lead-actions'

export const dynamic = 'force-dynamic'

interface SubscriptionRow {
    id: string
    status: string
    ends_at: string | null
    started_at: string
    plan: { code: string; name: string } | null
}

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

    const isPending = lead.status === 'new' || lead.status === 'contacted'
    const duplicates = isPending ? await checkLeadDuplicates(lead) : null

    let subscription: SubscriptionRow | null = null
    if (lead.approved_entity_id) {
        const { data: subRaw } = await supabaseAdmin
            .from('subscriptions')
            .select('id, status, ends_at, started_at, plan:plans(code, name)')
            .eq('account_id', lead.approved_entity_id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (subRaw) {
            const s = subRaw as unknown as {
                id: string
                status: string
                ends_at: string | null
                started_at: string
                plan: { code: string; name: string } | { code: string; name: string }[] | null
            }
            const plan = Array.isArray(s.plan) ? (s.plan[0] ?? null) : s.plan
            subscription = { id: s.id, status: s.status, ends_at: s.ends_at, started_at: s.started_at, plan }
        }
    }

    const trial = getTrialConfig()
    const leadSource = (lead.custom_fields?.lead_source as string | undefined) ?? 'organic'
    const observacoes = (lead.custom_fields?.observacoes as string | undefined) ?? null

    const customFieldRows = config.customFields
        .filter((f) => f.name !== 'observacoes')
        .map((f) => {
            const raw = lead.custom_fields[f.name]
            if (raw === undefined || raw === null || raw === '') return null
            const display = f.options?.find((o) => o.value === String(raw))?.label ?? String(raw)
            return { label: f.label ?? f.name, value: display, key: f.name }
        })
        .filter((r): r is { label: string; value: string; key: string } => r !== null)

    return (
        <div className="space-y-6">
            <Link
                href={`${config.panelBasePath}/leads`}
                className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-primary"
            >
                ← Voltar para leads
            </Link>

            {/* Header */}
            <div className="rounded-2xl border border-border-dark bg-surface-dark p-6 sm:p-8">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${tConfig.cls}`}>
                        {tConfig.emoji} {tConfig.label}
                    </span>
                    <StatusBadge status={lead.status} />
                    <span className="text-xs text-text-secondary">
                        {new Date(lead.created_at).toLocaleString('pt-BR')}
                    </span>
                </div>
                <h1 className="text-3xl font-black text-white">{lead.organization_name}</h1>
                <div className="mt-1 text-text-secondary">{lead.name}</div>
            </div>

            {/* Duplicate warning */}
            {duplicates &&
                (duplicates.emailMatch ||
                    duplicates.accountMatches.length > 0 ||
                    duplicates.restaurantMatches.length > 0) && (
                    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
                        <div className="mb-2 text-sm font-bold text-amber-300">
                            ⚠️ Possíveis duplicidades — confirme antes de aprovar
                        </div>
                        <ul className="space-y-1 text-sm text-amber-100">
                            {duplicates.emailMatch && (
                                <li>
                                    • Email já existe:{' '}
                                    <span className="font-semibold">
                                        {duplicates.emailMatch.email}
                                    </span>{' '}
                                    (será reutilizado o usuário existente).
                                </li>
                            )}
                            {duplicates.accountMatches.length > 0 && (
                                <li>
                                    • Accounts com nome parecido:{' '}
                                    <span className="font-semibold">
                                        {duplicates.accountMatches.map((m) => m.name).join(', ')}
                                    </span>
                                </li>
                            )}
                            {duplicates.restaurantMatches.length > 0 && (
                                <li>
                                    • Restaurantes com nome parecido:{' '}
                                    <span className="font-semibold">
                                        {duplicates.restaurantMatches.map((m) => m.name).join(', ')}
                                    </span>
                                </li>
                            )}
                        </ul>
                    </div>
                )}

            {/* Cards grid */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Restaurante">
                    <Field label="Nome" value={lead.organization_name} />
                    {customFieldRows.map((r) => (
                        <Field key={r.key} label={r.label} value={r.value} />
                    ))}
                    {lead.city && <Field label="Cidade" value={lead.city} />}
                    {lead.state && <Field label="UF" value={lead.state} />}
                </Card>

                <Card title="Owner">
                    <Field label="Nome" value={lead.name} />
                    <Field label="E-mail" value={lead.email} />
                    <Field label="WhatsApp" value={lead.phone} />
                </Card>

                <Card title="Qualificação">
                    <div className="text-sm">
                        <div className="font-bold text-primary">{playbook.headline}</div>
                        <div className="mt-1 text-xs text-text-secondary">{playbook.description}</div>
                    </div>
                    {observacoes && (
                        <div className="mt-3 rounded-lg border border-border-dark bg-surface-deep p-3">
                            <div className="mb-1 text-xs font-semibold text-text-secondary">
                                Observações
                            </div>
                            <div className="whitespace-pre-wrap text-sm text-white">{observacoes}</div>
                        </div>
                    )}
                </Card>

                <Card title="Comercial">
                    <Field label="Origem" value={leadSource} />
                    <Field label="Temperatura" value={`${tConfig.emoji} ${tConfig.label}`} />
                    <Field label="Criado em" value={new Date(lead.created_at).toLocaleString('pt-BR')} />
                    <Field
                        label="Atualizado em"
                        value={new Date(lead.updated_at).toLocaleString('pt-BR')}
                    />
                </Card>

                <Card title="Trial & Billing" wide>
                    {subscription ? (
                        <SubscriptionView sub={subscription} />
                    ) : (
                        <div className="text-sm text-text-secondary">
                            Aprovação criará automaticamente um trial de{' '}
                            <span className="font-bold text-white">
                                {trial.trialDays} {trial.trialDays === 1 ? 'dia' : 'dias'}
                            </span>{' '}
                            no plano <span className="font-bold text-white">{trial.planCode}</span>.
                        </div>
                    )}
                </Card>
            </div>

            {/* Actions */}
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

function Card({
    title,
    children,
    wide,
}: {
    title: string
    children: React.ReactNode
    wide?: boolean
}) {
    return (
        <div
            className={`rounded-2xl border border-border-dark bg-surface-dark p-5 ${
                wide ? 'lg:col-span-2' : ''
            }`}
        >
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">{title}</div>
            <div className="space-y-2">{children}</div>
        </div>
    )
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs font-semibold text-text-secondary">{label}</div>
            <div className="text-right text-sm text-white">{value}</div>
        </div>
    )
}

function StatusBadge({ status }: { status: Lead['status'] }) {
    const map: Record<Lead['status'], { label: string; cls: string }> = {
        new: { label: 'NOVO', cls: 'bg-surface-deep text-text-secondary border-border-dark' },
        contacted: { label: 'CONTATADO', cls: 'bg-primary/10 text-primary border-primary/30' },
        approved: { label: 'APROVADO', cls: 'bg-success/15 text-success border-success/30' },
        rejected: { label: 'REJEITADO', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
    }
    const m = map[status]
    return (
        <span className={`rounded-md border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${m.cls}`}>
            {m.label}
        </span>
    )
}

function SubscriptionView({ sub }: { sub: SubscriptionRow }) {
    const endsAt = sub.ends_at ? new Date(sub.ends_at) : null
    const now = new Date()
    const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - now.getTime()) / 86400_000) : null
    const expired = endsAt ? endsAt.getTime() < now.getTime() : false

    return (
        <div className="space-y-2 text-sm">
            <Field label="Plano" value={sub.plan ? `${sub.plan.code} — ${sub.plan.name}` : '—'} />
            <Field label="Status" value={sub.status} />
            {endsAt && (
                <Field
                    label={sub.status === 'trial' ? 'Trial termina em' : 'Renovação'}
                    value={`${endsAt.toLocaleDateString('pt-BR')}${
                        daysLeft !== null && !expired ? ` (faltam ${daysLeft} dias)` : ''
                    }${expired ? ' (expirado)' : ''}`}
                />
            )}
        </div>
    )
}
