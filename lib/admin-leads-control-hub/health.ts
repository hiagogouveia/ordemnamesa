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
    onboardingIncompleteWarningDays: number
    onboardingIncompleteRiskDays: number
    noEventsRiskDays: number
    weeklyActiveUsersWarning: number
}

export const HEALTH_CONFIG: HealthConfig = {
    inactiveDaysWarning: 7,
    inactiveDaysRisk: 14,
    lowExecutionsWarning: 5,
    lowExecutionsRisk: 1,
    ownerNoLoginWarning: 14,
    ownerNoLoginRisk: 30,
    trialEndingWarningDays: 7,
    onboardingIncompleteWarningDays: 3,
    onboardingIncompleteRiskDays: 7,
    noEventsRiskDays: 14,
    weeklyActiveUsersWarning: 1,
}

export interface HealthInput {
    accountActive: boolean
    subscriptionStatus: SubscriptionStatus | null
    subscriptionEndsAt: string | null
    lastAssumptionAt: string | null
    executionsLast7d: number
    ownerLastSignInAt: string | null
    createdAt: string
    // V2 — engagement signals (opcionais; ausentes mantêm comportamento V1)
    eventsLast7d?: number
    distinctUsersLast7d?: number
    lastEventAt?: string | null
    hasFirstChecklist?: boolean
    hasFirstTaskCompleted?: boolean
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

    // V2 — engagement signals (só avaliam se foram fornecidos)
    if (input.eventsLast7d !== undefined && input.lastEventAt !== undefined) {
        const accountAgeDays = daysBetween(input.createdAt) ?? 0
        const daysSinceEvent = daysBetween(input.lastEventAt ?? null)

        if (daysSinceEvent === null && accountAgeDays > config.noEventsRiskDays) {
            signals.push({ label: 'Sem nenhum evento registrado', severity: 'risk' })
            bump('risk')
        } else if (daysSinceEvent !== null && daysSinceEvent >= config.noEventsRiskDays) {
            signals.push({
                label: `Sem eventos há ${daysSinceEvent}d`,
                severity: 'risk',
            })
            bump('risk')
        }

        if (
            input.distinctUsersLast7d !== undefined &&
            daysSinceEvent !== null &&
            daysSinceEvent < config.noEventsRiskDays &&
            input.distinctUsersLast7d <= config.weeklyActiveUsersWarning
        ) {
            signals.push({
                label: `WAU baixo (${input.distinctUsersLast7d} usuário${input.distinctUsersLast7d === 1 ? '' : 's'})`,
                severity: 'warning',
            })
            bump('warning')
        }

        if (
            input.hasFirstChecklist !== undefined &&
            input.hasFirstTaskCompleted !== undefined
        ) {
            const onboardingComplete = input.hasFirstChecklist && input.hasFirstTaskCompleted
            if (!onboardingComplete) {
                if (accountAgeDays >= config.onboardingIncompleteRiskDays) {
                    signals.push({ label: 'Onboarding incompleto', severity: 'risk' })
                    bump('risk')
                } else if (accountAgeDays >= config.onboardingIncompleteWarningDays) {
                    signals.push({ label: 'Onboarding incompleto', severity: 'warning' })
                    bump('warning')
                }
            }
        }
    }

    if (signals.length === 0) {
        signals.push({ label: 'Operando normalmente', severity: 'info' })
    }

    const score: HealthScore =
        highest === 'risk' ? 'RISK' : highest === 'warning' ? 'WARNING' : 'HEALTHY'

    return { score, signals }
}
