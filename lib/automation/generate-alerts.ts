import 'server-only'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import {
    listRestaurantsAdmin,
    type RestaurantAdminListItem,
} from '@/lib/admin-leads-control-hub/restaurants-admin'

export type AlertType =
    | 'trial_expiring'
    | 'inactive_restaurant'
    | 'onboarding_incomplete'
    | 'health_risk'

export type AlertSeverity = 'info' | 'warning' | 'risk'

export interface AlertGenerationRules {
    trialExpiringDays: number
    inactiveDays: number
    inactiveMinAgeDays: number
}

export const ALERT_RULES: AlertGenerationRules = {
    trialExpiringDays: 3,
    inactiveDays: 14,
    inactiveMinAgeDays: 7,
}

interface DetectedAlert {
    type: AlertType
    severity: AlertSeverity
    title: string
    description: string
    metadata: Record<string, unknown>
}

interface OpenAlertRow {
    id: string
    restaurant_id: string | null
    alert_type: AlertType
}

const DAY_MS = 86_400_000

function detectAlerts(
    item: RestaurantAdminListItem,
    rules: AlertGenerationRules
): DetectedAlert[] {
    const out: DetectedAlert[] = []
    const now = Date.now()

    if (item.billing.subscription_status === 'trial' && item.billing.ends_at) {
        const daysToEnd = (Date.parse(item.billing.ends_at) - now) / DAY_MS
        if (daysToEnd > 0 && daysToEnd <= rules.trialExpiringDays) {
            const remaining = Math.ceil(daysToEnd)
            out.push({
                type: 'trial_expiring',
                severity: 'warning',
                title: `Trial expira em ${remaining} dia${remaining === 1 ? '' : 's'}`,
                description: 'Cliente em trial — considerar follow-up para conversão.',
                metadata: { ends_at: item.billing.ends_at, days_remaining: remaining },
            })
        }
    }

    const restaurantAgeDays = Math.floor((now - Date.parse(item.created_at)) / DAY_MS)
    if (restaurantAgeDays >= rules.inactiveMinAgeDays) {
        if (!item.last_assumption_at) {
            out.push({
                type: 'inactive_restaurant',
                severity: 'warning',
                title: 'Sem atividade desde a criação',
                description: `Restaurante criado há ${restaurantAgeDays} dias e nunca registrou execução.`,
                metadata: { restaurant_age_days: restaurantAgeDays },
            })
        } else {
            const daysSince = Math.floor((now - Date.parse(item.last_assumption_at)) / DAY_MS)
            if (daysSince >= rules.inactiveDays) {
                out.push({
                    type: 'inactive_restaurant',
                    severity: 'risk',
                    title: `Sem atividade há ${daysSince} dias`,
                    description: 'Risco de churn — considerar contato proativo.',
                    metadata: { last_activity_at: item.last_assumption_at, days_since: daysSince },
                })
            }
        }
    }

    const onboardingSignal = item.health.signals.find((s) => s.label === 'Onboarding incompleto')
    if (onboardingSignal) {
        out.push({
            type: 'onboarding_incomplete',
            severity: onboardingSignal.severity === 'risk' ? 'risk' : 'warning',
            title: 'Onboarding incompleto',
            description:
                'Cliente ainda não criou checklist ou nunca completou uma tarefa.',
            metadata: { age_days: restaurantAgeDays },
        })
    }

    if (item.health.score === 'RISK' && item.account.active) {
        out.push({
            type: 'health_risk',
            severity: 'risk',
            title: 'Health score em RISK',
            description: item.health.signals.map((s) => s.label).join(' · '),
            metadata: { signals: item.health.signals },
        })
    }

    return out
}

export interface AlertGenerationResult {
    evaluated: number
    created: number
    autoResolved: number
}

/**
 * Idempotente: re-rodar não cria duplicatas. Reconcilia o estado dos alertas
 * abertos com o resultado da detecção; alertas que não foram detectados nesta
 * execução são auto-resolvidos.
 */
export async function generateAlerts(
    rules: AlertGenerationRules = ALERT_RULES
): Promise<AlertGenerationResult> {
    let evaluated = 0
    let created = 0
    let autoResolved = 0

    // Buscar todos os alertas abertos uma única vez (escalável até alguns milhares)
    const { data: openAlertsRaw } = await supabaseAdmin
        .from('operational_alerts')
        .select('id, restaurant_id, alert_type')
        .is('resolved_at', null)
    const openAlerts = (openAlertsRaw ?? []) as OpenAlertRow[]

    const openByRestaurant = new Map<string, Map<AlertType, string>>()
    for (const a of openAlerts) {
        if (!a.restaurant_id) continue
        let m = openByRestaurant.get(a.restaurant_id)
        if (!m) {
            m = new Map()
            openByRestaurant.set(a.restaurant_id, m)
        }
        m.set(a.alert_type, a.id)
    }

    const inserts: Array<{
        account_id: string | null
        restaurant_id: string
        alert_type: AlertType
        severity: AlertSeverity
        title: string
        description: string
        metadata: Record<string, unknown>
    }> = []
    const idsToResolve: string[] = []

    let page = 1
    const perPage = 100
    while (true) {
        const { items, total } = await listRestaurantsAdmin({ page, perPage })
        for (const item of items) {
            evaluated += 1
            const detected = detectAlerts(item, rules)
            const detectedTypes = new Set(detected.map((d) => d.type))
            const openMap = openByRestaurant.get(item.id) ?? new Map<AlertType, string>()

            for (const d of detected) {
                if (!openMap.has(d.type)) {
                    inserts.push({
                        account_id: item.account.id,
                        restaurant_id: item.id,
                        alert_type: d.type,
                        severity: d.severity,
                        title: d.title,
                        description: d.description,
                        metadata: d.metadata,
                    })
                }
            }
            for (const [type, alertId] of openMap) {
                if (!detectedTypes.has(type)) idsToResolve.push(alertId)
            }
        }
        if (page * perPage >= total || items.length === 0) break
        page += 1
        if (page > 50) break // safety cap
    }

    if (inserts.length > 0) {
        const { error } = await supabaseAdmin.from('operational_alerts').insert(inserts)
        if (error) {
            console.error('[generateAlerts] insert failed', error.message)
        } else {
            created = inserts.length
        }
    }

    if (idsToResolve.length > 0) {
        const { error } = await supabaseAdmin
            .from('operational_alerts')
            .update({
                resolved_at: new Date().toISOString(),
                resolved_by: 'system',
                resolution_reason: 'Condição não mais detectada na automação.',
            })
            .in('id', idsToResolve)
        if (error) {
            console.error('[generateAlerts] auto-resolve failed', error.message)
        } else {
            autoResolved = idsToResolve.length
        }
    }

    return { evaluated, created, autoResolved }
}
