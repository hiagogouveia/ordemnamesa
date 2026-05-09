export interface TrialConfig {
    trialDays: number
    planCode: 'A' | 'B' | 'C' | 'D'
}

const VALID_PLAN_CODES = ['A', 'B', 'C', 'D'] as const

export function getTrialConfig(): TrialConfig {
    const rawDays = process.env.LEAD_TRIAL_DAYS
    const parsedDays = rawDays ? Number(rawDays) : NaN
    const trialDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.floor(parsedDays) : 14

    const rawPlan = (process.env.LEAD_TRIAL_PLAN_CODE ?? 'A').toUpperCase()
    const planCode = (VALID_PLAN_CODES as readonly string[]).includes(rawPlan)
        ? (rawPlan as TrialConfig['planCode'])
        : 'A'

    return { trialDays, planCode }
}
