import type { RecurrenceV2 } from "@/lib/types"
import { findWeekdayPositionInMonth } from "./weekday-position"

/**
 * Calcula as próximas N ocorrências de uma recorrência v2 a partir de uma
 * data inicial — **client-safe** (não importa rrule, não importa evaluator).
 *
 * - Suporta: `daily`, `weekly`, `monthly`, `yearly`, `shift_days` (parcial — vide nota).
 * - **NÃO suporta**: `custom` (rrule). Para esse tipo o caller deve mostrar
 *   texto descritivo em vez de datas concretas.
 *
 * Política:
 *  - Itera dia a dia até encontrar `count` ocorrências OU atingir `maxDays`.
 *  - Datas no formato YYYY-MM-DD em fuso de São Paulo (estável, sem ambiguidade).
 *  - Para `shift_days`, usa `shifts` se fornecidos; senão devolve fallback "todo dia"
 *    (consistente com a lógica do evaluator do servidor).
 */
export interface PreviewContext {
    /** Dia da semana 0-6 (0=Dom). */
    dayOfWeek: number
    /** Data atual em YYYY-MM-DD. */
    dateKey: string
    /** Shifts ativos do restaurante (para `shift_days`). */
    shifts?: { shift_type?: string | null; days_of_week: number[] }[]
    /** Identificador de turno do checklist (para `shift_days`). */
    shiftLabel?: string | null
}

export interface PreviewOccurrence {
    /** YYYY-MM-DD em fuso SP. */
    dateKey: string
    /** Dia da semana 0-6. */
    dayOfWeek: number
    /** Formato dd/MM (curto, para a UI). */
    shortLabel: string
}

export const PREVIEW_DEFAULT_COUNT = 5
/**
 * Lookahead padrão para weekly/daily/shift_days. Para tipos de baixa frequência
 * (monthly/yearly), o helper estende automaticamente — vide `defaultMaxDays`.
 */
export const PREVIEW_MAX_DAYS = 90

/**
 * Retorna `null` para tipo `'custom'` — caller decide o que exibir.
 * Caso contrário, retorna a lista de próximas N ocorrências.
 *
 * O `maxDays` é opcional: quando omitido, ajusta-se ao tipo (mensal: 1 ano,
 * anual: 6 anos, demais: 90 dias) para que a busca consiga encontrar `count`
 * ocorrências mesmo em recorrências esparsas.
 */
export function getNextOccurrences(
    config: RecurrenceV2,
    ctx: PreviewContext,
    count: number = PREVIEW_DEFAULT_COUNT,
    maxDays?: number,
): PreviewOccurrence[] | null {
    if (config.type === "custom") return null

    const start = parseISODate(ctx.dateKey)
    if (!start) return []

    const limit = maxDays ?? defaultMaxDays(config)
    const result: PreviewOccurrence[] = []

    for (let offset = 0; offset < limit && result.length < count; offset++) {
        const probe = addDays(start, offset)
        const probeKey = formatISODate(probe)
        const probeDow = probe.getUTCDay()

        if (matches(config, probe, probeDow, ctx)) {
            result.push({
                dateKey: probeKey,
                dayOfWeek: probeDow,
                shortLabel: formatShort(probe),
            })
        }
    }

    return result
}

/**
 * Avalia se uma data específica casa com o config — réplica simplificada
 * da lógica do evaluator do servidor para os tipos não-custom.
 */
function matches(
    config: RecurrenceV2,
    date: Date,
    dayOfWeek: number,
    ctx: PreviewContext,
): boolean {
    const day = date.getUTCDate()
    const month = date.getUTCMonth() + 1
    const year = date.getUTCFullYear()

    switch (config.type) {
        case "daily":
            return true

        case "weekly":
            return config.weekdays.includes(dayOfWeek)

        case "shift_days": {
            const label = ctx.shiftLabel
            if (!label || label === "any") return true
            const shifts = ctx.shifts
            if (!shifts || shifts.length === 0) return true
            const matching = shifts.filter((s) => s.shift_type === label)
            if (matching.length === 0) return true
            const allDays = new Set(matching.flatMap((s) => s.days_of_week))
            return allDays.has(dayOfWeek)
        }

        case "monthly":
            if (config.mode === "day_of_month") {
                return day === config.day
            }
            // weekday_position
            const expectedMonthly = findWeekdayPositionInMonth(
                year,
                month,
                config.weekday,
                config.weekOfMonth,
            )
            return expectedMonthly !== null && day === expectedMonthly

        case "yearly":
            if (config.mode === "date") {
                return month === config.month && day === config.day
            }
            // weekday_position
            if (month !== config.month) return false
            const expectedYearly = findWeekdayPositionInMonth(
                year,
                config.month,
                config.weekday,
                config.weekOfMonth,
            )
            return expectedYearly !== null && day === expectedYearly

        case "custom":
            // Tipo já filtrado em getNextOccurrences; defensivo.
            return false
    }
}

function defaultMaxDays(config: RecurrenceV2): number {
    if (config.type === "yearly") return 366 * 6   // até 6 anos
    if (config.type === "monthly") return 366       // 1 ano
    return PREVIEW_MAX_DAYS                          // 90 dias
}

// ─── Helpers internos (UTC, sem timezone do navegador) ─────────────────────

function parseISODate(dateKey: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
    if (!m) return null
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function addDays(d: Date, n: number): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n))
}

function formatISODate(d: Date): string {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function formatShort(d: Date): string {
    const day = String(d.getUTCDate()).padStart(2, "0")
    const month = String(d.getUTCMonth() + 1).padStart(2, "0")
    return `${day}/${month}`
}
