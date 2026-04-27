import { RRule } from "rrule"
import type { RecurrenceV2 } from "@/lib/types"
import { findWeekdayPositionInMonth, parseDateKey } from "./weekday-position"

export interface ShiftForRecurrence {
    shift_type?: string | null
    days_of_week: number[]
}

export interface EvaluateContext {
    /** Dia da semana 0-6 (0=Dom) — em fuso de São Paulo. */
    dayOfWeek: number
    /** Data atual em YYYY-MM-DD (fuso de São Paulo). */
    dateKey: string
    /** Shifts ativos do restaurante — necessário apenas para `type='shift_days'`. */
    shifts?: ShiftForRecurrence[]
    /** Identificador do shift do checklist (`'morning' | 'afternoon' | 'evening' | 'any'`). */
    shiftLabel?: string | null
}

/**
 * Avalia se uma recorrência v2 deve aparecer hoje.
 *
 * Política fail-closed: tipos malformados retornam `false` (em vez do
 * fallback "mostra todo dia" do v1). Isso é seguro porque qualquer
 * payload com `version === 2` passou por `validateV2` no backend.
 */
export function evaluateV2(config: RecurrenceV2, ctx: EvaluateContext): boolean {
    switch (config.type) {
        case "daily":
            return true

        case "weekly":
            return config.weekdays.includes(ctx.dayOfWeek)

        case "shift_days":
            return evaluateShiftDays(ctx)

        case "monthly":
            return evaluateMonthly(config, ctx.dateKey)

        case "yearly":
            return evaluateYearly(config, ctx.dateKey)

        case "custom":
            return evaluateCustom(config.rrule, ctx.dateKey)
    }
}

/**
 * Replica fielmente o comportamento atual de v1 para `shift_days` para que a
 * versão 2 deste tipo seja indistinguível do legado.
 */
function evaluateShiftDays(ctx: EvaluateContext): boolean {
    const shiftLabel = ctx.shiftLabel
    if (!shiftLabel || shiftLabel === "any") return true
    if (!ctx.shifts || ctx.shifts.length === 0) return true

    const matching = ctx.shifts.filter((s) => s.shift_type === shiftLabel)
    if (matching.length === 0) return true

    const allDays = new Set(matching.flatMap((s) => s.days_of_week))
    return allDays.has(ctx.dayOfWeek)
}

function evaluateMonthly(
    config: Extract<RecurrenceV2, { type: "monthly" }>,
    dateKey: string,
): boolean {
    const parsed = parseDateKey(dateKey)
    if (!parsed) return false

    if (config.mode === "day_of_month") {
        // F.2: dia 31 em mês com 30/28/29 dias → não aparece (pula o mês)
        return parsed.day === config.day
    }

    // weekday_position
    const expectedDay = findWeekdayPositionInMonth(
        parsed.year,
        parsed.month,
        config.weekday,
        config.weekOfMonth,
    )
    // F.3: posição inexistente → não aparece
    if (expectedDay === null) return false
    return parsed.day === expectedDay
}

function evaluateYearly(
    config: Extract<RecurrenceV2, { type: "yearly" }>,
    dateKey: string,
): boolean {
    const parsed = parseDateKey(dateKey)
    if (!parsed) return false

    if (config.mode === "date") {
        // F.1: 29/fev em ano não bissexto → não aparece (parsed.month !== 2 ou
        // parsed.day !== 29 nesse ano, então comparação simples basta).
        return parsed.month === config.month && parsed.day === config.day
    }

    // weekday_position
    if (parsed.month !== config.month) return false
    const expectedDay = findWeekdayPositionInMonth(
        parsed.year,
        config.month,
        config.weekday,
        config.weekOfMonth,
    )
    if (expectedDay === null) return false
    return parsed.day === expectedDay
}

function evaluateCustom(rruleString: string, dateKey: string): boolean {
    const parsed = parseDateKey(dateKey)
    if (!parsed) return false

    let rule: RRule
    try {
        rule = RRule.fromString(rruleString)
    } catch {
        return false
    }

    // Janela do dia em UTC: o RRule lib retorna ocorrências em UTC.
    // Tratamos o `dateKey` como dia calendário (sem hora). Buscamos qualquer
    // ocorrência que caia dentro do dia em qualquer interpretação razoável de
    // timezone — usamos UTC como referência.
    const startOfDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0))
    const endOfDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 23, 59, 59))

    const occurrences = rule.between(startOfDay, endOfDay, true)
    return occurrences.length > 0
}
