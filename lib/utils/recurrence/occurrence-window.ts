/**
 * Sprint 96 — traduz o filtro escolhido na UI numa janela de datas.
 *
 * Puro e sem relógio: o `todayKey` é INJETADO pelo caller, que o obtém de
 * `useRestaurantNow()` / `getNowInTz(tz)` com o fuso do restaurante. Uma função
 * que chamasse `new Date()` aqui usaria o fuso do navegador e erraria o dia perto
 * da meia-noite — exatamente a classe de bug dos falsos "ATRASADO" (s73).
 *
 * Convenções decididas na s96:
 *  - "Esta semana" = semana civil DOMINGO → SÁBADO, incluindo dias já passados.
 *  - "Este mês"    = mês civil COMPLETO (dia 1 → último), incluindo dias passados.
 *  - Chips de dia da semana = FORWARD-ONLY: a próxima data ≥ hoje com aquele dia
 *    (hoje mesmo, quando casa). Para olhar um dia já passado existe o calendário.
 */

import {
    addDays,
    dayOfWeekFromDateKey,
    endOfMonth,
    endOfWeekSaturday,
    isValidDateKey,
    startOfMonth,
    startOfWeekSunday,
} from "@/lib/utils/date-key"
import { MONTH_NAMES, WEEKDAY_NAMES } from "./describe"
import { parseDateKey } from "./weekday-position"

/** Prefixo do filtro de data específica escolhida no calendário. */
const DATE_PREFIX = "date:"

export type OccurrenceFilter =
    | ""
    | "today"
    | "tomorrow"
    | "dow-0"
    | "dow-1"
    | "dow-2"
    | "dow-3"
    | "dow-4"
    | "dow-5"
    | "dow-6"
    | "week"
    | "month"
    | `${typeof DATE_PREFIX}${string}`

export interface OccurrenceWindow {
    /** Primeiro dia do período, inclusivo. `YYYY-MM-DD`. */
    startKey: string
    /** Último dia do período, inclusivo. `YYYY-MM-DD`. */
    endKey: string
}

const SIMPLE_FILTERS = new Set<string>([
    "today",
    "tomorrow",
    "week",
    "month",
    "dow-0",
    "dow-1",
    "dow-2",
    "dow-3",
    "dow-4",
    "dow-5",
    "dow-6",
])

/**
 * Normaliza um valor cru vindo da URL. Valor desconhecido ou data inválida vira
 * `""` (sem filtro) em vez de quebrar a tela — mesma política graciosa já usada
 * para `type` e `assignment_origin` em `checklists/page.tsx`.
 */
export function normalizeOccurrenceFilter(raw: string | null | undefined): OccurrenceFilter {
    if (!raw) return ""
    if (SIMPLE_FILTERS.has(raw)) return raw as OccurrenceFilter
    if (raw.startsWith(DATE_PREFIX)) {
        const dateKey = raw.slice(DATE_PREFIX.length)
        if (isValidDateKey(dateKey)) return `${DATE_PREFIX}${dateKey}`
    }
    return ""
}

/** Monta o filtro de data específica a partir de um `dateKey` (retorna `""` se inválido). */
export function dateFilter(dateKey: string): OccurrenceFilter {
    return isValidDateKey(dateKey) ? `${DATE_PREFIX}${dateKey}` : ""
}

/** `dateKey` embutido num filtro `date:` — `null` para qualquer outro filtro. */
export function filterDateKey(filter: OccurrenceFilter): string | null {
    if (!filter.startsWith(DATE_PREFIX)) return null
    const dateKey = filter.slice(DATE_PREFIX.length)
    return isValidDateKey(dateKey) ? dateKey : null
}

/**
 * Janela de datas do filtro. `null` = sem filtro de ocorrência (mostrar tudo).
 *
 * @param filter   Filtro já normalizado.
 * @param todayKey Hoje no fuso do restaurante (`YYYY-MM-DD`).
 */
export function buildOccurrenceWindow(
    filter: OccurrenceFilter,
    todayKey: string,
): OccurrenceWindow | null {
    if (!filter) return null
    if (!isValidDateKey(todayKey)) return null

    if (filter === "today") return single(todayKey)
    if (filter === "tomorrow") return single(addDays(todayKey, 1))
    if (filter === "week") {
        return { startKey: startOfWeekSunday(todayKey), endKey: endOfWeekSaturday(todayKey) }
    }
    if (filter === "month") {
        return { startKey: startOfMonth(todayKey), endKey: endOfMonth(todayKey) }
    }

    const specific = filterDateKey(filter)
    if (specific) return single(specific)

    if (filter.startsWith("dow-")) {
        const target = Number(filter.slice(4))
        const todayDow = dayOfWeekFromDateKey(todayKey)
        if (todayDow === null || !Number.isInteger(target) || target < 0 || target > 6) return null
        // Forward-only: 0 quando é hoje, senão 1..6 dias à frente.
        const delta = (target - todayDow + 7) % 7
        return single(addDays(todayKey, delta))
    }

    return null
}

function single(dateKey: string): OccurrenceWindow {
    return { startKey: dateKey, endKey: dateKey }
}

/**
 * Rótulo do período para o gestor — deixa explícito QUAL data está sendo vista,
 * o que é essencial nos chips de dia da semana (que podem apontar para a semana
 * seguinte) e no calendário.
 *
 * Exemplos:
 *   "Rotinas de hoje — terça-feira, 11 de agosto"
 *   "Rotinas de sexta-feira, 14 de agosto"
 *   "Rotinas desta semana — 9 a 15 de agosto"
 *   "Rotinas de agosto de 2026"
 */
export function describeOccurrenceWindow(
    filter: OccurrenceFilter,
    window: OccurrenceWindow,
): string {
    if (filter === "month") {
        const parsed = parseDateKey(window.startKey)
        if (!parsed) return "Rotinas do período"
        return `Rotinas de ${MONTH_NAMES[parsed.month - 1]} de ${parsed.year}`
    }

    if (filter === "week") {
        return `Rotinas desta semana — ${rangeLabel(window.startKey, window.endKey)}`
    }

    const full = fullDateLabel(window.startKey)
    if (!full) return "Rotinas do período"
    if (filter === "today") return `Rotinas de hoje — ${full}`
    if (filter === "tomorrow") return `Rotinas de amanhã — ${full}`
    return `Rotinas de ${full}`
}

/** "terça-feira, 11 de agosto" */
function fullDateLabel(dateKey: string): string | null {
    const parsed = parseDateKey(dateKey)
    const dow = dayOfWeekFromDateKey(dateKey)
    if (!parsed || dow === null) return null
    return `${WEEKDAY_NAMES[dow]}, ${parsed.day} de ${MONTH_NAMES[parsed.month - 1]}`
}

/** "9 a 15 de agosto" · "30 de agosto a 5 de setembro" · "27 de dezembro a 2 de janeiro" */
function rangeLabel(startKey: string, endKey: string): string {
    const a = parseDateKey(startKey)
    const b = parseDateKey(endKey)
    if (!a || !b) return ""
    if (a.month === b.month && a.year === b.year) {
        return `${a.day} a ${b.day} de ${MONTH_NAMES[b.month - 1]}`
    }
    return `${a.day} de ${MONTH_NAMES[a.month - 1]} a ${b.day} de ${MONTH_NAMES[b.month - 1]}`
}
