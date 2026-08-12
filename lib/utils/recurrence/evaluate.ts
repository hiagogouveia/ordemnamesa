import { RRule } from "rrule"
import type { RecurrenceV2 } from "@/lib/types"
import { daysInMonth, findWeekdayPositionInMonth, parseDateKey } from "./weekday-position"

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
    /** Sprint 66: turnos da rotina (shifts.id) — N:N. Conjunto vazio = "Todos os turnos". */
    shiftIds?: string[] | null
    /** Enum legado do shift. Fallback quando não há shiftIds (rotinas pré-s61/legadas). */
    shiftLabel?: string | null
}

/**
 * Sprint 66: resolve os dias da semana ativos para `shift_days` no modelo N:N.
 * - shiftIds com 1+ turnos → UNIÃO dos `days_of_week` de todos os turnos da rotina.
 * - sem shiftIds, enum legado presente → caminho legado por `shift_type` (compat).
 * - "Todos os turnos" → UNIÃO dos dias de TODOS os turnos ativos (s96, vide abaixo).
 *
 * Retorna `null` quando não há informação para restringir e a rotina deve
 * aparecer todo dia.
 *
 * ── Sprint 96: "Todos os turnos" deixa de significar "todo dia" ─────────────
 *
 * Antes, uma rotina `shift_days` marcada como "Todos os turnos" caía neste
 * fallback e aparecia TODO DIA — inclusive em dias em que nenhum turno opera.
 * Isso contradizia o próprio nome da recorrência e produzia incoerência dentro
 * da mesma tela: rotinas com turno específico desapareciam no domingo enquanto
 * as de "Todos os turnos" continuavam listadas, ambas rotuladas "Dias do turno".
 *
 * "Todos os turnos" agora significa o que diz: os dias em que a operação
 * funciona, isto é, a união dos dias de todos os turnos ativos. Restaurante que
 * não abre domingo não vê rotina de turno no domingo.
 *
 * O fallback permissivo é preservado onde é legítimo — quando de fato não há
 * informação para restringir:
 *  - `shifts` ausente ou vazio (visão global, restaurante sem turno cadastrado)
 *  - união vazia (turnos existem mas nenhum declara dias)
 * Nesses casos esconder seria pior que mostrar: a rotina desapareceria sem que
 * ninguém tivesse dito em que dias ela não deveria rodar.
 */
export function resolveShiftDays(
    shiftIds: string[] | null | undefined,
    shiftLabel: string | null | undefined,
    shifts: ShiftForRecurrence[] | undefined,
): number[] | null {
    if (shiftIds && shiftIds.length > 0) {
        if (!shifts || shifts.length === 0) return null
        const idSet = new Set(shiftIds)
        const matching = shifts.filter((s) => s.id != null && idSet.has(s.id))
        // Nenhum turno encontrado na lista (ex.: inativos) → fallback "mostra".
        if (matching.length === 0) return null
        return matching.flatMap((s) => s.days_of_week)
    }

    if (!shifts || shifts.length === 0) return null

    // "Todos os turnos": sem vínculo específico, os dias da operação são a união
    // de todos os turnos ativos. Os callers já filtram `active=true` — tanto no
    // servidor (/api/my-activities, /api/tasks/kanban) quanto no cliente
    // (/api/shifts), então a lista recebida aqui é sempre só de turnos ativos.
    if (!shiftLabel || shiftLabel === "any") {
        return nonEmptyOrNull(shifts.flatMap((s) => s.days_of_week))
    }

    // Caminho legado por enum (rotinas sem turnos N:N).
    const matching = shifts.filter((s) => s.shift_type === shiftLabel)
    if (matching.length === 0) return null
    return matching.flatMap((s) => s.days_of_week)
}

/** União vazia = nenhum turno declara dias → sem informação para restringir. */
function nonEmptyOrNull(days: number[]): number[] | null {
    return days.length > 0 ? days : null
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
    const days = resolveShiftDays(ctx.shiftIds, ctx.shiftLabel, ctx.shifts)
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

    if (config.mode === "days_of_month") {
        // -1 = último dia do mês; demais comparam direto (dias inexistentes pulam).
        const lastDay = daysInMonth(parsed.year, parsed.month)
        return config.days.some((d) => (d === -1 ? parsed.day === lastDay : parsed.day === d))
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

    // Janela do dia em UTC: o RRule lib retorna ocorrências em UTC.
    // Tratamos o `dateKey` como dia calendário (sem hora). Buscamos qualquer
    // ocorrência que caia dentro do dia em qualquer interpretação razoável de
    // timezone — usamos UTC como referência.
    const startOfDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0))
    const endOfDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 23, 59, 59))

    return evaluateCustomRange(rruleString, startOfDay, endOfDay)
}

/**
 * Sprint 96 — a rotina `custom` tem alguma ocorrência dentro de [start, end]?
 *
 * ── Por que NÃO usar `RRule.fromString` ──────────────────────────────────────
 *
 * `legacyConfigToV2Rrule` gera strings SEM `DTSTART` (ex.: `FREQ=WEEKLY;BYDAY=MO`).
 * Nesse caso o `RRule.fromString` ancora o `dtstart` em `new Date()` — o instante
 * do parse. Consequências, confirmadas em runtime:
 *
 *  - Nenhuma data ANTERIOR ao parse casa. Rotinas personalizadas nunca apareciam
 *    em dias já passados (quebraria "Esta semana"/"Este mês").
 *  - Entre 21h e 24h em São Paulo, `new Date()` já está no dia seguinte em UTC
 *    enquanto `dateKey` ainda é o dia corrente → o `dtstart` cai FORA da janela
 *    consultada e a rotina sumia de "Hoje" em /turno, kanban, dashboard, overdue
 *    e notificações nas últimas 3 horas de todo dia.
 *  - `INTERVAL=N` e `COUNT=N` ficavam não-determinísticos (âncora móvel).
 *
 * Ancorar o `dtstart` AUSENTE no início da janela consultada torna a avaliação
 * determinística e nunca esconde o que hoje aparece. Um `DTSTART` explícito na
 * string tem precedência e continua sendo respeitado, assim como `UNTIL`/`COUNT`.
 *
 * Limitação aceita: sem âncora real, `INTERVAL=2` (quinzenal) e `COUNT=N` passam
 * a ser fail-open. Antes já eram fail-open — só que instáveis. A correção
 * definitiva é ancorar em `checklists.created_at`, e depende de o campo chegar
 * até aqui.
 *
 * Política fail-closed preservada: rrule inválida → `false`.
 */
export function evaluateCustomRange(rruleString: string, start: Date, end: Date): boolean {
    try {
        const options = RRule.parseString(rruleString)
        if (!options.dtstart) options.dtstart = start
        return new RRule(options).between(start, end, true).length > 0
    } catch {
        return false
    }
}
