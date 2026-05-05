import type { Lead, LeadControlHubConfig } from './types'

export type LeadTemperature = 'hot' | 'warm' | 'cold'
export const LEAD_TEMPERATURE_VALUES: LeadTemperature[] = ['hot', 'warm', 'cold']

const SORT_ORDER: Record<LeadTemperature, number> = { hot: 0, warm: 1, cold: 2 }

export function compareByTemperature(
    a: { temperature: LeadTemperature; created_at: string },
    b: { temperature: LeadTemperature; created_at: string }
): number {
    const tDiff = SORT_ORDER[a.temperature] - SORT_ORDER[b.temperature]
    if (tDiff !== 0) return tDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

export function computeLeadTemperature(
    config: LeadControlHubConfig,
    lead: Lead
): LeadTemperature {
    if (config.leadScoring?.hot?.(lead)) return 'hot'
    if (config.leadScoring?.cold?.(lead)) return 'cold'
    return 'warm'
}

export const LEAD_TEMPERATURE_CONFIG: Record<
    LeadTemperature,
    { label: string; emoji: string; cls: string }
> = {
    hot: { label: 'Quente', emoji: '🔥', cls: 'bg-red-500/15 text-red-700 border-red-500/40' },
    warm: { label: 'Morno', emoji: '🟡', cls: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/40' },
    cold: { label: 'Frio', emoji: '🔵', cls: 'bg-blue-500/15 text-blue-700 border-blue-500/40' },
}

export const LEAD_TEMPERATURE_PLAYBOOK: Record<
    LeadTemperature,
    { headline: string; description: string }
> = {
    hot: {
        headline: 'Alta dor — conduzir direto para demonstração',
        description: 'Lead qualificado e com urgência. Demo curta. Foco no problema declarado.',
    },
    warm: {
        headline: 'Explorar dores antes de apresentar',
        description: 'Faltam ingredientes para virar urgência. Faça perguntas antes de mostrar.',
    },
    cold: {
        headline: 'Educar antes de vender',
        description: 'Operação pequena ou já com solução. Conteúdo + relacionamento.',
    },
}
