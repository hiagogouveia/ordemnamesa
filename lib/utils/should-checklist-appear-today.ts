import type { RecurrenceConfig } from '@/lib/types'

interface ChecklistForRecurrence {
    recurrence?: string | null
    recurrence_config?: RecurrenceConfig | null
}

/**
 * Determina se um checklist deve aparecer hoje com base nas regras de recorrência.
 *
 * @param checklist - Checklist com campos de recorrência
 * @param brazilDayOfWeek - Dia da semana em São Paulo (0=Dom, 1=Seg, ..., 6=Sab)
 * @param brazilDateKey - Data atual em São Paulo no formato YYYY-MM-DD
 */
export function shouldChecklistAppearToday(
    checklist: ChecklistForRecurrence,
    brazilDayOfWeek: number,
    brazilDateKey: string,
): boolean {
    const { recurrence, recurrence_config } = checklist

    // Sem recorrência ou tipo simples que aparece todo dia
    if (!recurrence || recurrence === 'none') return true
    if (recurrence === 'daily') return true
    if (recurrence === 'weekly') return true
    if (recurrence === 'monthly') return true
    if (recurrence === 'yearly') return true

    // Dias úteis: segunda a sexta (1-5)
    if (recurrence === 'weekdays') {
        return brazilDayOfWeek >= 1 && brazilDayOfWeek <= 5
    }

    // Recorrência personalizada
    if (recurrence === 'custom') {
        return evaluateCustomRecurrence(recurrence_config, brazilDayOfWeek, brazilDateKey)
    }

    // Tipo desconhecido: mostra por segurança
    return true
}

function evaluateCustomRecurrence(
    config: RecurrenceConfig | null | undefined,
    brazilDayOfWeek: number,
    brazilDateKey: string,
): boolean {
    // Config ausente: fallback defensivo — mostra
    if (!config) return true

    // Verificar data de término
    if (config.end_type === 'date' && config.end_date) {
        if (brazilDateKey > config.end_date) return false
    }

    // Frequência semanal com dias específicos
    if (config.frequency === 'weekly') {
        const days = config.days_of_week
        if (Array.isArray(days) && days.length > 0) {
            return days.includes(brazilDayOfWeek)
        }
        // days_of_week vazio ou ausente: mostra todo dia (fallback defensivo)
        return true
    }

    // Frequência diária ou mensal sem restrição de dia
    return true
}

/**
 * Filtra uma lista de checklists mantendo apenas os que devem aparecer hoje.
 */
export function filterChecklistsByRecurrence<T extends ChecklistForRecurrence>(
    checklists: T[],
    brazilDayOfWeek: number,
    brazilDateKey: string,
): T[] {
    return checklists.filter(c => shouldChecklistAppearToday(c, brazilDayOfWeek, brazilDateKey))
}
