import 'server-only'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import type { AlertSeverity, AlertType } from './generate-alerts'

export interface OperationalAlert {
    id: string
    account_id: string | null
    restaurant_id: string | null
    alert_type: AlertType
    severity: AlertSeverity
    title: string
    description: string | null
    metadata: Record<string, unknown>
    resolved_at: string | null
    resolved_by: string | null
    resolution_reason: string | null
    created_at: string
}

export interface ListAlertsArgs {
    status?: 'open' | 'resolved' | 'all'
    severity?: AlertSeverity | 'all'
    type?: AlertType | 'all'
    limit?: number
}

const DEFAULT_LIMIT = 100

export async function listOperationalAlerts(
    args: ListAlertsArgs = {}
): Promise<OperationalAlert[]> {
    const limit = Math.min(500, Math.max(10, args.limit ?? DEFAULT_LIMIT))
    let q = supabaseAdmin
        .from('operational_alerts')
        .select(
            'id, account_id, restaurant_id, alert_type, severity, title, description, metadata, resolved_at, resolved_by, resolution_reason, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(limit)

    if (args.status === 'open') q = q.is('resolved_at', null)
    else if (args.status === 'resolved') q = q.not('resolved_at', 'is', null)
    if (args.severity && args.severity !== 'all') q = q.eq('severity', args.severity)
    if (args.type && args.type !== 'all') q = q.eq('alert_type', args.type)

    const { data, error } = await q
    if (error) return []
    return (data ?? []) as OperationalAlert[]
}

export async function countOpenAlertsByRestaurant(
    restaurantId: string
): Promise<{ total: number; bySeverity: Record<AlertSeverity, number> }> {
    const { data } = await supabaseAdmin
        .from('operational_alerts')
        .select('severity')
        .eq('restaurant_id', restaurantId)
        .is('resolved_at', null)
    const rows = (data ?? []) as Array<{ severity: AlertSeverity }>
    const bySeverity: Record<AlertSeverity, number> = { info: 0, warning: 0, risk: 0 }
    for (const r of rows) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1
    return { total: rows.length, bySeverity }
}

export async function listOpenAlertsForRestaurant(
    restaurantId: string
): Promise<OperationalAlert[]> {
    const { data } = await supabaseAdmin
        .from('operational_alerts')
        .select(
            'id, account_id, restaurant_id, alert_type, severity, title, description, metadata, resolved_at, resolved_by, resolution_reason, created_at'
        )
        .eq('restaurant_id', restaurantId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
    return (data ?? []) as OperationalAlert[]
}

export interface RestaurantNameRow {
    id: string
    name: string
    account: { name: string } | null
}

/**
 * Carrega nomes de restaurantes em batch para enriquecer linhas de alerta na UI.
 */
export async function getRestaurantNamesByIds(
    ids: string[]
): Promise<Map<string, { name: string; account_name: string }>> {
    const out = new Map<string, { name: string; account_name: string }>()
    const filtered = Array.from(new Set(ids.filter((x): x is string => !!x)))
    if (filtered.length === 0) return out
    const { data } = await supabaseAdmin
        .from('restaurants')
        .select('id, name, accounts(name)')
        .in('id', filtered)
    const rows = (data ?? []) as unknown as Array<{
        id: string
        name: string
        accounts: { name: string } | null
    }>
    for (const r of rows) {
        out.set(r.id, { name: r.name, account_name: r.accounts?.name ?? '—' })
    }
    return out
}
