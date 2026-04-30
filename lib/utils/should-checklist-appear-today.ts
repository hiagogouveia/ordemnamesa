import type { RecurrenceConfig, RecurrenceV2 } from '@/lib/types'
import { evaluateV2 } from './recurrence/evaluate'

interface ChecklistForRecurrence {
    recurrence?: string | null
    recurrence_config?: RecurrenceConfig | RecurrenceV2 | null
    shift?: string | null
}

interface ShiftForRecurrence {
    shift_type?: string | null
    days_of_week: number[]
}

/**
 * Roteia para v2 apenas quando `recurrence_config.version === 2` (estrito,
 * numérico). Qualquer outro formato — incluindo string '2', version 1, ou
 * ausência total — cai na lógica v1 sem alteração.
 */
function isRecurrenceV2(
    config: RecurrenceConfig | RecurrenceV2 | null | undefined,
): config is RecurrenceV2 {
    return (
        typeof config === 'object' &&
        config !== null &&
        (config as { version?: unknown }).version === 2
    )
}

/**
 * Determina se um checklist deve aparecer hoje com base nas regras de recorrência.
 *
 * @param checklist - Checklist com campos de recorrência
 * @param brazilDayOfWeek - Dia da semana em São Paulo (0=Dom, 1=Seg, ..., 6=Sab)
 * @param brazilDateKey - Data atual em São Paulo no formato YYYY-MM-DD
 * @param shifts - Turnos ativos do restaurante (necessário para recurrence='shift_days')
 */
export function shouldChecklistAppearToday(
    checklist: ChecklistForRecurrence,
    brazilDayOfWeek: number,
    brazilDateKey: string,
    shifts?: ShiftForRecurrence[],
): boolean {
    const { recurrence, recurrence_config } = checklist

    // Roteamento v2 (não toca em v1)
    if (isRecurrenceV2(recurrence_config)) {
        return evaluateV2(recurrence_config, {
            dayOfWeek: brazilDayOfWeek,
            dateKey: brazilDateKey,
            shifts,
            shiftLabel: checklist.shift,
        })
    }

    // Fallback defensivo: sem recorrência definida → mostra (não deveria acontecer pós-migration)
    if (!recurrence) return true

    if (recurrence === 'daily') return true

    // Dias úteis: segunda a sexta (1-5)
    if (recurrence === 'weekdays') {
        return brazilDayOfWeek >= 1 && brazilDayOfWeek <= 5
    }

    // Dias do turno: vincula dinamicamente aos dias configurados no turno
    if (recurrence === 'shift_days') {
        const shiftLabel = checklist.shift
        // Turno 'any' ou sem turno → mostra todo dia
        if (!shiftLabel || shiftLabel === 'any') return true
        // Sem dados de shifts → fallback defensivo (mostra)
        if (!shifts || shifts.length === 0) return true

        const matchingShifts = shifts.filter(s => s.shift_type === shiftLabel)
        // Nenhum shift com shift_type configurado → fallback (mostra)
        if (matchingShifts.length === 0) return true

        const allDays = new Set(matchingShifts.flatMap(s => s.days_of_week))
        return allDays.has(brazilDayOfWeek)
    }

    // Semanal/Mensal/Anual simples: aparece todo dia (lógica simplificada atual)
    if (recurrence === 'weekly') return true
    if (recurrence === 'monthly') return true
    if (recurrence === 'yearly') return true

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
    shifts?: ShiftForRecurrence[],
): T[] {
    return checklists.filter(c => shouldChecklistAppearToday(c, brazilDayOfWeek, brazilDateKey, shifts))
}
