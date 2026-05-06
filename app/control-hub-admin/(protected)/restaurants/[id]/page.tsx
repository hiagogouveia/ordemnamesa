import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
    getAdminLogsForRestaurant,
    getRestaurantAdminDetail,
    type AdminRestaurantStatus,
} from '@/lib/admin-leads-control-hub/restaurants-admin'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { config } from '@/lead-control-hub.config'
import { RestaurantActions } from './restaurant-actions'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<AdminRestaurantStatus, { label: string; cls: string }> = {
    active: { label: 'PAGO', cls: 'bg-success/15 text-success border-success/30' },
    trial: { label: 'TRIAL', cls: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30' },
    suspended: { label: 'SUSPENSO', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
}

function formatPriceCents(cents: number) {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(value: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleString('pt-BR')
}

export default async function RestaurantAdminDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const guard = await requireStaff()
    const isSuperAdmin = 'ctx' in guard && guard.ctx.role === 'SUPER_ADMIN'

    const detail = await getRestaurantAdminDetail(id)
    if (!detail) notFound()

    const logs = await getAdminLogsForRestaurant(detail)

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`${config.panelBasePath}/restaurants`}
                    className="text-sm text-primary hover:underline"
                >
                    ← Voltar para lista
                </Link>
            </div>

            {/* Cabeçalho */}
            <div className="rounded-2xl border border-border-dark bg-surface-dark p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                    STATUS_LABEL[detail.derived_status].cls
                                }`}
                            >
                                {STATUS_LABEL[detail.derived_status].label}
                            </span>
                            {detail.billing.plan && (
                                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                                    Plano {detail.billing.plan.code} · {detail.billing.plan.name}
                                </span>
                            )}
                            {detail.billing.trial_expired && (
                                <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300">
                                    Trial expirado
                                </span>
                            )}
                        </div>
                        <h1 className="mt-2 text-3xl font-black text-white">{detail.name}</h1>
                        <p className="text-sm text-text-secondary">
                            Account: <span className="text-white">{detail.account.name}</span> · Slug:{' '}
                            <span className="font-mono text-white">{detail.slug}</span>
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                            Criado em {formatDate(detail.created_at)}
                            {detail.cnpj ? ` · CNPJ ${detail.cnpj}` : ''}
                            {detail.is_primary ? ' · UNIDADE PRINCIPAL' : ''}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Owner */}
                <Section title="Owner / Admin">
                    {detail.owner ? (
                        <div className="space-y-3">
                            <FieldRow label="Nome" value={detail.owner.name ?? '—'} />
                            <FieldRow label="Email" value={detail.owner.email ?? '—'} mono />
                            <FieldRow label="Telefone" value={detail.owner.phone ?? '—'} />
                            <FieldRow
                                label="Último login"
                                value={formatDate(detail.owner.last_sign_in_at)}
                            />
                            <FieldRow
                                label="Email confirmado"
                                value={detail.owner.confirmed ? 'Sim' : 'Não'}
                            />
                            <div className="pt-2">
                                <RestaurantActions
                                    restaurantId={detail.id}
                                    ownerEmail={detail.owner.email}
                                    ownerPhone={detail.owner.phone}
                                    isSuperAdmin={isSuperAdmin}
                                />
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-text-secondary">
                            Nenhum owner vinculado encontrado.
                        </p>
                    )}
                </Section>

                {/* Métricas */}
                <Section title="Métricas básicas">
                    <div className="grid grid-cols-2 gap-3">
                        <Metric label="Usuários" value={detail.users_count.toString()} />
                        <Metric label="Checklists" value={detail.checklists_count.toString()} />
                        <Metric
                            label="Execuções"
                            value={detail.executions_count.toString()}
                        />
                        <Metric
                            label="Último acesso owner"
                            value={
                                detail.owner?.last_sign_in_at
                                    ? new Date(detail.owner.last_sign_in_at).toLocaleDateString(
                                          'pt-BR'
                                      )
                                    : '—'
                            }
                        />
                        <Metric label="Storage usado" value="—" hint="em breve" />
                        <Metric
                            label="Account criada"
                            value={new Date(detail.account.created_at).toLocaleDateString('pt-BR')}
                        />
                    </div>
                </Section>

                {/* Billing */}
                <Section title="Plano & Billing">
                    <div className="space-y-3">
                        <FieldRow
                            label="Plano atual"
                            value={
                                detail.billing.plan
                                    ? `${detail.billing.plan.code} · ${detail.billing.plan.name}`
                                    : '—'
                            }
                        />
                        <FieldRow
                            label="Status assinatura"
                            value={detail.billing.subscription_status ?? '—'}
                        />
                        <FieldRow
                            label="Ciclo"
                            value={detail.billing.billing_cycle ?? '—'}
                        />
                        <FieldRow
                            label="Preço mensal"
                            value={
                                detail.billing.plan
                                    ? formatPriceCents(detail.billing.plan.price_monthly_cents)
                                    : '—'
                            }
                        />
                        <FieldRow
                            label="Início"
                            value={formatDate(detail.billing.started_at)}
                        />
                        <FieldRow
                            label="Trial / Próxima cobrança"
                            value={formatDate(detail.billing.ends_at)}
                        />
                        <FieldRow
                            label="Cancelado em"
                            value={formatDate(detail.billing.canceled_at)}
                        />
                        <FieldRow
                            label="Stripe customer"
                            value={detail.billing.stripe_customer_id ?? '—'}
                            mono
                        />
                        <FieldRow
                            label="Stripe subscription"
                            value={detail.billing.stripe_subscription_id ?? '—'}
                            mono
                        />
                    </div>
                </Section>

                {/* Restaurantes da account */}
                <Section title={`Outros restaurantes da account (${detail.sibling_restaurants.length})`}>
                    {detail.sibling_restaurants.length === 0 ? (
                        <p className="text-sm text-text-secondary">
                            Esta account possui apenas este restaurante.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {detail.sibling_restaurants.map((s) => (
                                <li key={s.id}>
                                    <Link
                                        href={`${config.panelBasePath}/restaurants/${s.id}`}
                                        className="flex items-center justify-between rounded-lg border border-border-dark bg-surface-deep px-3 py-2 text-sm hover:border-primary/40"
                                    >
                                        <span className="text-white">
                                            {s.name}{' '}
                                            {s.is_primary && (
                                                <span className="ml-1 text-[10px] font-bold uppercase text-primary">
                                                    primary
                                                </span>
                                            )}
                                        </span>
                                        <span
                                            className={
                                                s.active
                                                    ? 'text-[10px] font-bold uppercase text-success'
                                                    : 'text-[10px] font-bold uppercase text-red-300'
                                            }
                                        >
                                            {s.active ? 'ativo' : 'inativo'}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>
            </div>

            {/* Logs */}
            <Section title="Logs administrativos">
                {logs.length === 0 ? (
                    <p className="text-sm text-text-secondary">
                        Nenhuma ação administrativa registrada para este restaurante.
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-border-dark">
                        <table className="w-full text-xs">
                            <thead className="border-b border-border-dark bg-surface-deep text-left uppercase tracking-wider text-text-secondary">
                                <tr>
                                    <th className="px-3 py-2 font-bold">Quando</th>
                                    <th className="px-3 py-2 font-bold">Admin</th>
                                    <th className="px-3 py-2 font-bold">Ação</th>
                                    <th className="px-3 py-2 font-bold">Alvo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr
                                        key={log.id}
                                        className="border-b border-border-dark last:border-0"
                                    >
                                        <td className="px-3 py-2 text-text-secondary">
                                            {new Date(log.created_at).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-3 py-2 text-white">{log.admin_email}</td>
                                        <td className="px-3 py-2">
                                            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-primary">
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-text-secondary">
                                            {log.target_type ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-border-dark bg-surface-dark p-6">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">
                {title}
            </h2>
            {children}
        </div>
    )
}

function FieldRow({
    label,
    value,
    mono,
}: {
    label: string
    value: string
    mono?: boolean
}) {
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-dark/60 pb-2 last:border-0 last:pb-0">
            <span className="text-xs uppercase tracking-wider text-text-secondary">{label}</span>
            <span className={mono ? 'font-mono text-sm text-white' : 'text-sm text-white'}>
                {value}
            </span>
        </div>
    )
}

function Metric({
    label,
    value,
    hint,
}: {
    label: string
    value: string
    hint?: string
}) {
    return (
        <div className="rounded-lg border border-border-dark bg-surface-deep p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                {label}
            </div>
            <div className="mt-1 text-xl font-black text-white">{value}</div>
            {hint && <div className="mt-0.5 text-[10px] text-text-secondary">{hint}</div>}
        </div>
    )
}
