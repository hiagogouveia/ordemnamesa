import Link from 'next/link'
import {
    listOperationalAlerts,
    getRestaurantNamesByIds,
    type OperationalAlert,
} from '@/lib/automation/queries'
import type { AlertSeverity, AlertType } from '@/lib/automation/generate-alerts'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { config } from '@/lead-control-hub.config'
import { ResolveAlertButton, RunAutomationButton } from './alert-buttons'

export const dynamic = 'force-dynamic'

interface SearchParams {
    status?: string
    severity?: string
    type?: string
}

const TYPE_LABEL: Record<AlertType, string> = {
    trial_expiring: 'Trial expirando',
    inactive_restaurant: 'Restaurante inativo',
    onboarding_incomplete: 'Onboarding incompleto',
    health_risk: 'Health em risco',
}

const SEVERITY_TONE: Record<AlertSeverity, string> = {
    info: 'border-border-dark bg-surface-deep text-text-secondary',
    warning: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
    risk: 'border-red-500/40 bg-red-500/10 text-red-300',
}

function ageLabel(iso: string): string {
    const ms = Date.now() - Date.parse(iso)
    const minutes = Math.floor(ms / 60_000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 48) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
}

export default async function AlertsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>
}) {
    const sp = await searchParams
    const status = (sp.status ?? 'open') as 'open' | 'resolved' | 'all'
    const severity = (sp.severity ?? 'all') as AlertSeverity | 'all'
    const type = (sp.type ?? 'all') as AlertType | 'all'

    const guard = await requireStaff()
    const isSuperAdmin = 'ctx' in guard && guard.ctx.role === 'SUPER_ADMIN'

    const alerts = await listOperationalAlerts({ status, severity, type, limit: 200 })
    const namesMap = await getRestaurantNamesByIds(
        alerts.map((a) => a.restaurant_id).filter((x): x is string => !!x)
    )

    const counts = {
        open: alerts.filter((a) => !a.resolved_at).length,
        risk: alerts.filter((a) => a.severity === 'risk' && !a.resolved_at).length,
        warning: alerts.filter((a) => a.severity === 'warning' && !a.resolved_at).length,
    }

    const baseHref = `${config.panelBasePath}/alerts`
    const buildHref = (overrides: Partial<SearchParams>) => {
        const params = new URLSearchParams()
        const merged = { status, severity, type, ...overrides }
        if (merged.status && merged.status !== 'open') params.set('status', merged.status)
        if (merged.severity && merged.severity !== 'all') params.set('severity', merged.severity)
        if (merged.type && merged.type !== 'all') params.set('type', merged.type)
        const qs = params.toString()
        return qs ? `${baseHref}?${qs}` : baseHref
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-white">Alertas operacionais</h1>
                    <p className="text-sm text-text-secondary">
                        {alerts.length} {alerts.length === 1 ? 'alerta' : 'alertas'} ·{' '}
                        <span className="text-red-300">●</span> {counts.risk} risco ·{' '}
                        <span className="text-yellow-300">●</span> {counts.warning} atenção ·{' '}
                        <span className="text-success">●</span> {counts.open} abertos
                    </p>
                </div>
                <RunAutomationButton isSuperAdmin={isSuperAdmin} />
            </div>

            <form action={baseHref} method="get" className="rounded-2xl border border-border-dark bg-surface-dark p-4">
                <div className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto]">
                    <select
                        name="status"
                        defaultValue={status}
                        className="h-11 rounded-lg border border-border-dark bg-surface-deep px-3 text-sm text-white focus:border-primary focus:outline-0"
                    >
                        <option value="open">Abertos</option>
                        <option value="resolved">Resolvidos</option>
                        <option value="all">Todos</option>
                    </select>
                    <select
                        name="severity"
                        defaultValue={severity}
                        className="h-11 rounded-lg border border-border-dark bg-surface-deep px-3 text-sm text-white focus:border-primary focus:outline-0"
                    >
                        <option value="all">Todas as severidades</option>
                        <option value="risk">Risco</option>
                        <option value="warning">Atenção</option>
                        <option value="info">Info</option>
                    </select>
                    <select
                        name="type"
                        defaultValue={type}
                        className="h-11 rounded-lg border border-border-dark bg-surface-deep px-3 text-sm text-white focus:border-primary focus:outline-0"
                    >
                        <option value="all">Todos os tipos</option>
                        <option value="trial_expiring">Trial expirando</option>
                        <option value="inactive_restaurant">Restaurante inativo</option>
                        <option value="onboarding_incomplete">Onboarding incompleto</option>
                        <option value="health_risk">Health em risco</option>
                    </select>
                    <button
                        type="submit"
                        className="h-11 rounded-lg bg-primary px-4 text-sm font-bold text-[#111e22] hover:bg-[#0ea5d6]"
                    >
                        Filtrar
                    </button>
                </div>
                {(status !== 'open' || severity !== 'all' || type !== 'all') && (
                    <div className="mt-3 text-xs">
                        <Link href={baseHref} className="text-primary hover:underline">
                            Limpar filtros
                        </Link>
                    </div>
                )}
            </form>

            {alerts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-dark bg-surface-dark/50 p-12 text-center">
                    <div className="text-3xl">🟢</div>
                    <p className="mt-2 text-sm text-text-secondary">
                        Nenhum alerta com os filtros atuais. Use "Rodar automação agora" para gerar.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {alerts.map((alert) => (
                        <AlertRow key={alert.id} alert={alert} namesMap={namesMap} />
                    ))}
                </div>
            )}
            <p className="text-[11px] text-text-secondary">
                Limite de 200 itens. Use os filtros para refinar. Auto-resolve roda quando a
                condição não é mais detectada na próxima execução da automação.
            </p>
        </div>
    )
}

function AlertRow({
    alert,
    namesMap,
}: {
    alert: OperationalAlert
    namesMap: Map<string, { name: string; account_name: string }>
}) {
    const restaurant = alert.restaurant_id ? namesMap.get(alert.restaurant_id) : null
    const isOpen = !alert.resolved_at
    return (
        <div className="rounded-2xl border border-border-dark bg-surface-dark p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY_TONE[alert.severity]}`}
                        >
                            {alert.severity}
                        </span>
                        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            {TYPE_LABEL[alert.alert_type]}
                        </span>
                        {!isOpen && (
                            <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                                Resolvido
                            </span>
                        )}
                        <span className="text-[11px] text-text-secondary">
                            há {ageLabel(alert.created_at)}
                        </span>
                    </div>
                    <div className="mt-2 text-sm font-bold text-white">{alert.title}</div>
                    {alert.description && (
                        <div className="text-xs text-text-secondary">{alert.description}</div>
                    )}
                    {restaurant && alert.restaurant_id && (
                        <div className="mt-1 text-xs">
                            <Link
                                href={`${config.panelBasePath}/restaurants/${alert.restaurant_id}`}
                                className="text-primary hover:underline"
                            >
                                {restaurant.name}
                            </Link>
                            <span className="text-text-secondary"> · {restaurant.account_name}</span>
                        </div>
                    )}
                    {!isOpen && alert.resolved_by && (
                        <div className="mt-2 text-[11px] text-text-secondary">
                            Resolvido por <span className="text-white">{alert.resolved_by}</span>
                            {alert.resolved_at &&
                                ` em ${new Date(alert.resolved_at).toLocaleString('pt-BR')}`}
                            {alert.resolution_reason && ` · "${alert.resolution_reason}"`}
                        </div>
                    )}
                </div>
                {isOpen && <ResolveAlertButton alertId={alert.id} />}
            </div>
        </div>
    )
}
