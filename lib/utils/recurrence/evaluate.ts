import { RRule } from "rrule"
import type { RecurrenceV2 } from "@/lib/types"
import { findWeekdayPositionInMonth, parseDateKey } from "./weekday-position"

export interface ShiftForRecurrence {
    id?: string
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
    /** Sprint 61: turno cadastrado (shifts.id) do checklist. Fonte da verdade. */
    shiftId?: string | null
    /** Enum legado do shift (`'morning' | 'afternoon' | 'evening' | 'any'`). Fallback quando shiftId é nulo. */
    shiftLabel?: string | null
}

/**
 * Sprint 61: resolve os dias da semana ativos para `shift_days`.
 * - shiftId preenchido → usa diretamente os dias do turno cadastrado (fonte da verdade).
 * - shiftId nulo → caminho legado: casa o enum `shiftLabel` com `shift_type` e une os dias.
 *
 * Retorna `null` quando deve aparecer todo dia (fallback defensivo: "Todos os
 * turnos", sem dados de shifts, ou turno não encontrado na lista fornecida).
 */
export function resolveShiftDays(
    shiftId: string | null | undefined,
    shiftLabel: string | null | undefined,
    shifts: ShiftForRecurrence[] | undefined,
): number[] | null {
    if (shiftId) {
        if (!shifts || shifts.length === 0) return null
        const match = shifts.find((s) => s.id === shiftId)
        // Turno não encontrado (ex.: inativo, fora da lista) → fallback "mostra".
        if (!match) return null
        return match.days_of_week
    }

    // Caminho legado por enum (shift_id ausente em rotinas pré-s61).
    if (!shiftLabel || shiftLabel === "any") return null
    if (!shifts || shifts.length === 0) return null
    const matching = shifts.filter((s) => s.shift_type === shiftLabel)
    if (matching.length === 0) return null
    return matching.flatMap((s) => s.days_of_week)
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
 * `shift_days`: a rotina aparece nos dias configurados no turno. Sprint 61 passa
 * a resolver pelo turno cadastrado (shiftId) quando disponível; senão mantém o
 * comportamento legado por enum/shift_type — indistinguível do anterior.
 */
function evaluateShiftDays(ctx: EvaluateContext): boolean {
    const days = resolveShiftDays(ctx.shiftId, ctx.shiftLabel, ctx.shifts)
    if (days === null) return true
    return new Set(days).has(ctx.dayOfWeek)
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
