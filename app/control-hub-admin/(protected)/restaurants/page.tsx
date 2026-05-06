import Link from 'next/link'
import {
    listRestaurantsAdmin,
    listPlansForFilter,
    type AdminRestaurantStatus,
    type RestaurantAdminListItem,
} from '@/lib/admin-leads-control-hub/restaurants-admin'
import { config } from '@/lead-control-hub.config'

export const dynamic = 'force-dynamic'

interface SearchParams {
    q?: string
    plan?: string
    status?: string
    trial_expired?: string
    page?: string
}

export default async function RestaurantsAdminListPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>
}) {
    const sp = await searchParams
    const search = sp.q ?? ''
    const planFilter = sp.plan ?? 'all'
    const statusFilter = (sp.status ?? 'all') as AdminRestaurantStatus | 'all'
    const trialExpired = sp.trial_expired === '1'
    const page = Number.parseInt(sp.page ?? '1', 10) || 1

    const [{ items, total, perPage }, plans] = await Promise.all([
        listRestaurantsAdmin({
            search,
            plan: planFilter,
            status: statusFilter,
            trialExpired,
            page,
            perPage: 25,
        }),
        listPlansForFilter(),
    ])

    const counts = {
        active: items.filter((i) => i.derived_status === 'active').length,
        trial: items.filter((i) => i.derived_status === 'trial').length,
        suspended: items.filter((i) => i.derived_status === 'suspended').length,
    }

    const baseHref = `${config.panelBasePath}/restaurants`
    const buildHref = (overrides: Partial<SearchParams>) => {
        const params = new URLSearchParams()
        const merged = { q: search, plan: planFilter, status: statusFilter, trial_expired: trialExpired ? '1' : '', ...overrides }
        if (merged.q) params.set('q', merged.q)
        if (merged.plan && merged.plan !== 'all') params.set('plan', merged.plan)
        if (merged.status && merged.status !== 'all') params.set('status', merged.status)
        if (merged.trial_expired) params.set('trial_expired', '1')
        const qs = params.toString()
        return qs ? `${baseHref}?${qs}` : baseHref
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-white">Restaurantes</h1>
                    <p className="text-sm text-text-secondary">
                        {total} {total === 1 ? 'restaurante' : 'restaurantes'} · página {page} ·{' '}
                        <span className="text-success">●</span> {counts.active} ativos ·{' '}
                        <span className="text-yellow-300">●</span> {counts.trial} trial ·{' '}
                        <span className="text-red-300">●</span> {counts.suspended} suspensos
                    </p>
                </div>
            </div>

            <form
                action={baseHref}
                method="get"
                className="rounded-2xl border border-border-dark bg-surface-dark p-4"
            >
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                    <input
                        type="text"
                        name="q"
                        defaultValue={search}
                        placeholder="Buscar por nome, CNPJ, email…"
                        className="h-11 rounded-lg border border-border-dark bg-surface-deep px-3 text-sm text-white placeholder:text-[#5a7b88] focus:border-primary focus:outline-0"
                    />
                    <select
                        name="plan"
                        defaultValue={planFilter}
                        className="h-11 rounded-lg border border-border-dark bg-surface-deep px-3 text-sm text-white focus:border-primary focus:outline-0"
                    >
                        <option value="all">Todos os planos</option>
                        {plans.map((p) => (
                            <option key={p.id} value={p.code}>
                                {p.code} · {p.name}
                            </option>
                        ))}
                    </select>
                    <select
                        name="status"
                        defaultValue={statusFilter}
                        className="h-11 rounded-lg border border-border-dark bg-surface-deep px-3 text-sm text-white focus:border-primary focus:outline-0"
                    >
                        <option value="all">Todos os status</option>
                        <option value="active">Ativo</option>
                        <option value="trial">Trial</option>
                        <option value="suspended">Suspenso</option>
                    </select>
                    <label className="flex h-11 items-center gap-2 rounded-lg border border-border-dark bg-surface-deep px-3 text-sm text-text-secondary">
                        <input
                            type="checkbox"
                            name="trial_expired"
                            value="1"
                            defaultChecked={trialExpired}
                            className="h-4 w-4 accent-primary"
                        />
                        <span>Trial expirado</span>
                    </label>
                    <button
                        type="submit"
                        className="h-11 rounded-lg bg-primary px-4 text-sm font-bold text-[#111e22] shadow-[0_2px_8px_0_rgba(19,182,236,0.3)] hover:bg-[#0ea5d6]"
                    >
                        Filtrar
                    </button>
                </div>
                {(search || planFilter !== 'all' || statusFilter !== 'all' || trialExpired) && (
                    <div className="mt-3 text-xs">
                        <Link href={baseHref} className="text-primary hover:underline">
                            Limpar filtros
                        </Link>
                    </div>
                )}
            </form>

            {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-dark bg-surface-dark/50 p-12 text-center">
                    <div className="text-3xl">🏢</div>
                    <p className="mt-2 text-sm text-text-secondary">
                        Nenhum restaurante encontrado com os filtros atuais.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border-dark text-left text-xs uppercase tracking-wider text-text-secondary">
                                <tr>
                                    <th className="px-4 py-3 font-bold">Restaurante</th>
                                    <th className="px-4 py-3 font-bold">Owner</th>
                                    <th className="px-4 py-3 font-bold">Plano</th>
                                    <th className="px-4 py-3 font-bold">Status</th>
                                    <th className="px-4 py-3 font-bold">Métricas</th>
                                    <th className="px-4 py-3 font-bold">Criado</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((r) => (
                                    <RestaurantRow key={r.id} item={r} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {total > perPage && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">
                        Página {page} de {Math.ceil(total / perPage)}
                    </span>
                    <div className="flex gap-2">
                        {page > 1 && (
                            <Link
                                href={buildHref({ page: String(page - 1) })}
                                className="rounded-lg border border-border-dark bg-surface-dark px-3 py-1.5 text-sm font-semibold text-text-secondary hover:border-primary/40 hover:text-white"
                            >
                                ← Anterior
                            </Link>
                        )}
                        {page * perPage < total && (
                            <Link
                                href={buildHref({ page: String(page + 1) })}
                                className="rounded-lg border border-border-dark bg-surface-dark px-3 py-1.5 text-sm font-semibold text-text-secondary hover:border-primary/40 hover:text-white"
                            >
                                Próxima →
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function RestaurantRow({ item }: { item: RestaurantAdminListItem }) {
    const detailHref = `${config.panelBasePath}/restaurants/${item.id}`
    return (
        <tr className="border-b border-border-dark last:border-0 hover:bg-surface-deep/30">
            <td className="px-4 py-3">
                <Link href={detailHref} className="block">
                    <div className="font-bold text-white">{item.name}</div>
                    <div className="text-xs text-text-secondary">
                        {item.account.name}
                        {item.cnpj ? ` · CNPJ ${item.cnpj}` : ''}
                    </div>
                </Link>
            </td>
            <td className="px-4 py-3">
                {item.owner ? (
                    <>
                        <div className="text-white">{item.owner.name ?? '—'}</div>
                        <div className="text-xs text-text-secondary">{item.owner.email}</div>
                    </>
                ) : (
                    <span className="text-text-secondary">—</span>
                )}
            </td>
            <td className="px-4 py-3">
                {item.billing.plan ? (
                    <span className="rounded-md border border-border-dark bg-surface-deep px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                        {item.billing.plan.code} · {item.billing.plan.name}
                    </span>
                ) : (
                    <span className="text-text-secondary">—</span>
                )}
            </td>
            <td className="px-4 py-3">
                <StatusBadge status={item.derived_status} />
                {item.billing.trial_expired && (
                    <div className="mt-1">
                        <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300">
                            Trial expirado
                        </span>
                    </div>
                )}
            </td>
            <td className="px-4 py-3 text-text-secondary">
                <div className="text-xs">👥 {item.users_count} · 📋 {item.checklists_count}</div>
            </td>
            <td className="px-4 py-3 text-xs text-text-secondary">
                {new Date(item.created_at).toLocaleDateString('pt-BR')}
            </td>
            <td className="px-4 py-3 text-right">
                <Link
                    href={detailHref}
                    className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-primary/40 hover:text-white"
                >
                    Detalhes →
                </Link>
            </td>
        </tr>
    )
}

function StatusBadge({ status }: { status: AdminRestaurantStatus }) {
    const map: Record<AdminRestaurantStatus, { label: string; cls: string }> = {
        active: { label: 'PAGO', cls: 'bg-success/15 text-success border-success/30' },
        trial: { label: 'TRIAL', cls: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30' },
        suspended: { label: 'SUSPENSO', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
    }
    const m = map[status]
    return (
        <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}
        >
            {m.label}
        </span>
    )
}
