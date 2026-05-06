import type { SubscriptionStatus } from './restaurants-admin'

export type HealthScore = 'HEALTHY' | 'WARNING' | 'RISK'

export interface HealthConfig {
    inactiveDaysWarning: number
    inactiveDaysRisk: number
    inactiveDaysCritical: number
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
    inactiveDaysCritical: 30,
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
    /**
     * Sinais críticos disparam score = RISK isoladamente, sem precisar de
     * agregação. Usado para condições inequívocas: conta suspensa, assinatura
     * cancelada/inadimplente, trial expirado sem atividade, ≥30d sem atividade.
     */
    critical?: boolean
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
    const push = (s: HealthSignal) => signals.push(s)

    const accountAgeDays = daysBetween(input.createdAt) ?? 0
    const inactiveDays = daysBetween(input.lastAssumptionAt)
    const isInactiveLong =
        inactiveDays === null
            ? accountAgeDays > config.inactiveDaysCritical
            : inactiveDays >= config.inactiveDaysCritical

    if (!input.accountActive) {
        push({ label: 'Conta suspensa', severity: 'risk', critical: true })
    }

    if (input.subscriptionStatus === 'past_due' || input.subscriptionStatus === 'unpaid') {
        push({
            label: `Assinatura ${input.subscriptionStatus}`,
            severity: 'risk',
            critical: true,
        })
    } else if (input.subscriptionStatus === 'canceled') {
        push({ label: 'Assinatura cancelada', severity: 'risk', critical: true })
    } else if (input.subscriptionStatus === 'trial' && input.subscriptionEndsAt) {
        const daysToEnd = -((Date.parse(input.subscriptionEndsAt) - Date.now()) / 86_400_000)
        if (daysToEnd >= 0) {
            // Crítico apenas quando o trial expirou E não há atividade — combina
            // os dois sinais "trial_expired_and_inactive"
            const trialCritical = isInactiveLong || inactiveDays === null
            push({
                label: 'Trial expirado',
                severity: 'risk',
                critical: trialCritical,
            })
        } else if (-daysToEnd <= config.trialEndingWarningDays) {
            push({
                label: `Trial expira em ${Math.ceil(-daysToEnd)}d`,
                severity: 'warning',
            })
        }
    }

    if (input.lastAssumptionAt === null) {
        if (accountAgeDays > config.inactiveDaysCritical) {
            push({ label: 'Sem execuções desde criação', severity: 'risk', critical: true })
        } else if (accountAgeDays > config.inactiveDaysRisk) {
            push({ label: 'Sem execuções desde criação', severity: 'risk' })
        } else if (accountAgeDays > config.inactiveDaysWarning) {
            push({ label: 'Sem execuções desde criação', severity: 'warning' })
        }
    } else if (inactiveDays !== null) {
        if (inactiveDays >= config.inactiveDaysCritical) {
            push({
                label: `Sem atividade há ${inactiveDays}d`,
                severity: 'risk',
                critical: true,
            })
        } else if (inactiveDays >= config.inactiveDaysRisk) {
            push({ label: `Sem atividade há ${inactiveDays}d`, severity: 'risk' })
        } else if (inactiveDays >= config.inactiveDaysWarning) {
            push({ label: `Sem atividade há ${inactiveDays}d`, severity: 'warning' })
        }
    }

    if (input.executionsLast7d <= config.lowExecutionsRisk) {
        if (input.lastAssumptionAt) {
            push({
                label: `Apenas ${input.executionsLast7d} execuções nos últimos 7d`,
                severity: 'risk',
            })
        }
    } else if (input.executionsLast7d <= config.lowExecutionsWarning) {
        push({
            label: `Poucas execuções nos últimos 7d (${input.executionsLast7d})`,
            severity: 'warning',
        })
    }

    const ownerInactiveDays = daysBetween(input.ownerLastSignInAt)
    if (ownerInactiveDays === null) {
        push({ label: 'Owner nunca acessou', severity: 'warning' })
    } else if (ownerInactiveDays >= config.ownerNoLoginRisk) {
        push({ label: `Owner sem login há ${ownerInactiveDays}d`, severity: 'risk' })
    } else if (ownerInactiveDays >= config.ownerNoLoginWarning) {
        push({ label: `Owner sem login há ${ownerInactiveDays}d`, severity: 'warning' })
    }

    // V2 — engagement signals (só avaliam se foram fornecidos)
    if (input.eventsLast7d !== undefined && input.lastEventAt !== undefined) {
        const daysSinceEvent = daysBetween(input.lastEventAt ?? null)

        if (daysSinceEvent === null && accountAgeDays > config.noEventsRiskDays) {
            push({ label: 'Sem nenhum evento registrado', severity: 'risk' })
        } else if (daysSinceEvent !== null && daysSinceEvent >= config.noEventsRiskDays) {
            push({ label: `Sem eventos há ${daysSinceEvent}d`, severity: 'risk' })
        }

        if (
            input.distinctUsersLast7d !== undefined &&
            daysSinceEvent !== null &&
            daysSinceEvent < config.noEventsRiskDays &&
            input.distinctUsersLast7d <= config.weeklyActiveUsersWarning
        ) {
            push({
                label: `WAU baixo (${input.distinctUsersLast7d} usuário${input.distinctUsersLast7d === 1 ? '' : 's'})`,
                severity: 'warning',
            })
        }

        if (
            input.hasFirstChecklist !== undefined &&
            input.hasFirstTaskCompleted !== undefined
        ) {
            const onboardingComplete = input.hasFirstChecklist && input.hasFirstTaskCompleted
            if (!onboardingComplete) {
                if (accountAgeDays >= config.onboardingIncompleteRiskDays) {
                    push({ label: 'Onboarding incompleto', severity: 'risk' })
                } else if (accountAgeDays >= config.onboardingIncompleteWarningDays) {
                    push({ label: 'Onboarding incompleto', severity: 'warning' })
                }
            }
        }
    }

    if (signals.length === 0) {
        push({ label: 'Operando normalmente', severity: 'info' })
    }

    // Nova fórmula (Ajuste C): mais conservadora
    const criticalCount = signals.filter((s) => s.critical).length
    const riskCount = signals.filter((s) => s.severity === 'risk').length
    const warningCount = signals.filter((s) => s.severity === 'warning').length

    let score: HealthScore
    if (criticalCount >= 1 || riskCount >= 2) score = 'RISK'
    else if (riskCount === 1 || warningCount >= 2) score = 'WARNING'
    else score = 'HEALTHY'

    return { score, signals }
}
