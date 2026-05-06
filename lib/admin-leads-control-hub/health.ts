import type { SubscriptionStatus } from './restaurants-admin'

export type HealthScore = 'HEALTHY' | 'WARNING' | 'RISK'

export interface HealthConfig {
    inactiveDaysWarning: number
    inactiveDaysRisk: number
    lowExecutionsWarning: number
    lowExecutionsRisk: number
    ownerNoLoginWarning: number
    ownerNoLoginRisk: number
    trialEndingWarningDays: number
}

export const HEALTH_CONFIG: HealthConfig = {
    inactiveDaysWarning: 7,
    inactiveDaysRisk: 14,
    lowExecutionsWarning: 5,
    lowExecutionsRisk: 1,
    ownerNoLoginWarning: 14,
    ownerNoLoginRisk: 30,
    trialEndingWarningDays: 7,
}

export interface HealthInput {
    accountActive: boolean
    subscriptionStatus: SubscriptionStatus | null
    subscriptionEndsAt: string | null
    lastAssumptionAt: string | null
    executionsLast7d: number
    ownerLastSignInAt: string | null
    createdAt: string
}

export interface HealthSignal {
    label: string
    severity: 'info' | 'warning' | 'risk'
}

export interface HealthResult {
    score: HealthScore
    signals: HealthSignal[]
}

function daysBetween(iso: string | null, now = Date.now()): number | null {
    if (!iso) return null
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return null
    return Math.floor((now - t) / 86_400_000)
}

export function computeHealthScore(
    input: HealthInput,
    config: HealthConfig = HEALTH_CONFIG
): HealthResult {
    const signals: HealthSignal[] = []
    let highest: 'info' | 'warning' | 'risk' = 'info'
    const bump = (sev: 'info' | 'warning' | 'risk') => {
        if (sev === 'risk') highest = 'risk'
        else if (sev === 'warning' && highest !== 'risk') highest = 'warning'
    }

    if (!input.accountActive) {
        signals.push({ label: 'Conta suspensa', severity: 'risk' })
        bump('risk')
    }

    if (input.subscriptionStatus === 'past_due' || input.subscriptionStatus === 'unpaid') {
        signals.push({ label: `Assinatura ${input.subscriptionStatus}`, severity: 'risk' })
        bump('risk')
    } else if (input.subscriptionStatus === 'canceled') {
        signals.push({ label: 'Assinatura cancelada', severity: 'risk' })
        bump('risk')
    } else if (input.subscriptionStatus === 'trial' && input.subscriptionEndsAt) {
        const daysToEnd = -((Date.parse(input.subscriptionEndsAt) - Date.now()) / 86_400_000)
        if (daysToEnd >= 0) {
            signals.push({ label: 'Trial expirado', severity: 'risk' })
            bump('risk')
        } else if (-daysToEnd <= config.trialEndingWarningDays) {
            signals.push({
                label: `Trial expira em ${Math.ceil(-daysToEnd)}d`,
                severity: 'warning',
            })
            bump('warning')
        }
    }

    const inactiveDays = daysBetween(input.lastAssumptionAt) ?? Number.POSITIVE_INFINITY
    if (input.lastAssumptionAt === null) {
        const accountAgeDays = daysBetween(input.createdAt) ?? 0
        if (accountAgeDays > config.inactiveDaysRisk) {
            signals.push({ label: 'Sem execuções desde criação', severity: 'risk' })
            bump('risk')
        } else if (accountAgeDays > config.inactiveDaysWarning) {
            signals.push({ label: 'Sem execuções desde criação', severity: 'warning' })
            bump('warning')
        }
    } else if (inactiveDays >= config.inactiveDaysRisk) {
        signals.push({ label: `Sem atividade há ${inactiveDays}d`, severity: 'risk' })
        bump('risk')
    } else if (inactiveDays >= config.inactiveDaysWarning) {
        signals.push({ label: `Sem atividade há ${inactiveDays}d`, severity: 'warning' })
        bump('warning')
    }

    if (input.executionsLast7d <= config.lowExecutionsRisk) {
        if (input.lastAssumptionAt) {
            signals.push({
                label: `Apenas ${input.executionsLast7d} execuções nos últimos 7d`,
                severity: 'risk',
            })
            bump('risk')
        }
    } else if (input.executionsLast7d <= config.lowExecutionsWarning) {
        signals.push({
            label: `Poucas execuções nos últimos 7d (${input.executionsLast7d})`,
            severity: 'warning',
        })
        bump('warning')
    }

    const ownerInactiveDays = daysBetween(input.ownerLastSignInAt)
    if (ownerInactiveDays === null) {
        signals.push({ label: 'Owner nunca acessou', severity: 'warning' })
        bump('warning')
    } else if (ownerInactiveDays >= config.ownerNoLoginRisk) {
        signals.push({
            label: `Owner sem login há ${ownerInactiveDays}d`,
            severity: 'risk',
        })
        bump('risk')
    } else if (ownerInactiveDays >= config.ownerNoLoginWarning) {
        signals.push({
            label: `Owner sem login há ${ownerInactiveDays}d`,
            severity: 'warning',
        })
        bump('warning')
    }

    if (signals.length === 0) {
        signals.push({ label: 'Operando normalmente', severity: 'info' })
    }

    const score: HealthScore =
        highest === 'risk' ? 'RISK' : highest === 'warning' ? 'WARNING' : 'HEALTHY'

    return { score, signals }
}
