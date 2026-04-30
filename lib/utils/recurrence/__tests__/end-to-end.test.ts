/**
 * Testes end-to-end da cadeia completa de recorrência v2.
 *
 * Para cada opção do dropdown, este suite garante que:
 *
 *   1. O **builder** do frontend (build-modal/build-from-dropdown) produz um
 *      payload v2 estruturalmente correto.
 *   2. O **validador** do backend (validateV2) aceita esse payload sem erro.
 *   3. O **evaluator** do servidor (evaluateV2 — usado por
 *      shouldChecklistAppearToday em /api/my-activities, /api/tasks/kanban,
 *      /api/dashboard) retorna `true` nas datas em que o admin espera ver a
 *      rotina e `false` nas demais.
 *
 * Se este suite passar, está provado que cada opção do dropdown chega ao
 * staff no dia correto.
 */
import { describe, it, expect } from "vitest"
import {
    buildDailyExcept,
    buildWeekly,
    buildMonthlyDayOfMonth,
    buildMonthlyWeekdayPosition,
    buildYearlyDate,
    buildYearlyWeekdayPosition,
} from "../build-modal"
import { validateV2 } from "../validate"
import { evaluateV2, type EvaluateContext } from "../evaluate"

const SUN = 0
const MON = 1
const TUE = 2
const WED = 3
const THU = 4
const FRI = 5
const SAT = 6

function ctx(dayOfWeek: number, dateKey: string, extra: Partial<EvaluateContext> = {}): EvaluateContext {
    return { dayOfWeek, dateKey, ...extra }
}

// ─── Helper: roda toda a cadeia builder → validate → evaluate ──────────────

function runFullChain(
    builderResult: ReturnType<typeof buildDailyExcept>,
    evalCtx: EvaluateContext,
): boolean {
    // Passo 1: validador aceita
    const validated = validateV2(builderResult)
    expect(validated).toEqual(builderResult)
    // Passo 2: evaluator aplica
    return evaluateV2(validated, evalCtx)
}

// ============================================================================
// OPÇÃO 1 — "TODOS OS DIAS" (set direto no form, sem builder específico)
// ============================================================================
describe("E2E — Opção 'Todos os dias'", () => {
    const config = { version: 2 as const, type: "daily" as const }

    it("aparece em qualquer dia da semana", () => {
        for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
            expect(runFullChain(config, ctx(day, "2026-04-28"))).toBe(true)
        }
    })

    it("aparece em qualquer data do calendário", () => {
        const dates = [
            "2026-01-01",
            "2026-12-31",
            "2027-02-29", // ano não bissexto — não importa para daily
            "2030-06-15",
        ]
        for (const d of dates) {
            expect(runFullChain(config, ctx(MON, d))).toBe(true)
        }
    })
})

// ============================================================================
// OPÇÃO 2 — "DIAS DO TURNO" (set direto)
// ============================================================================
describe("E2E — Opção 'Dias do turno'", () => {
    const config = { version: 2 as const, type: "shift_days" as const }

    it("respeita days_of_week do shift correspondente", () => {
        const shifts = [{ shift_type: "morning", days_of_week: [MON, WED, FRI] }]

        // segunda → aparece
        expect(
            runFullChain(config, ctx(MON, "2026-04-27", { shiftLabel: "morning", shifts })),
        ).toBe(true)
        // terça → não aparece
        expect(
            runFullChain(config, ctx(TUE, "2026-04-28", { shiftLabel: "morning", shifts })),
        ).toBe(false)
    })

    it("shift='any' aparece todo dia", () => {
        expect(
            runFullChain(config, ctx(SAT, "2026-05-02", { shiftLabel: "any" })),
        ).toBe(true)
    })

    it("fallback defensivo (sem shifts) → aparece", () => {
        expect(
            runFullChain(config, ctx(MON, "2026-04-27", { shiftLabel: "morning", shifts: [] })),
        ).toBe(true)
    })
})

// ============================================================================
// OPÇÃO 3 — "DIÁRIO (EXCETO X DIAS)"
// ============================================================================
describe("E2E — Opção 'Diário (exceto X)'", () => {
    it("sem exceções → vira daily, aparece todo dia", () => {
        const config = buildDailyExcept([])
        expect(config).toEqual({ version: 2, type: "daily" })
        expect(runFullChain(config, ctx(SAT, "2026-05-02"))).toBe(true)
    })

    it("excluindo sáb e dom → vira weekly seg-sex", () => {
        const config = buildDailyExcept([SAT, SUN])
        expect(config).toEqual({ version: 2, type: "weekly", weekdays: [MON, TUE, WED, THU, FRI] })

        // Testa cada dia da semana
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(TUE, "2026-04-28"))).toBe(true)
        expect(runFullChain(config, ctx(WED, "2026-04-29"))).toBe(true)
        expect(runFullChain(config, ctx(THU, "2026-04-30"))).toBe(true)
        expect(runFullChain(config, ctx(FRI, "2026-05-01"))).toBe(true)
        expect(runFullChain(config, ctx(SAT, "2026-05-02"))).toBe(false)
        expect(runFullChain(config, ctx(SUN, "2026-05-03"))).toBe(false)
    })

    it("excluindo só domingo → todos os dias menos domingo", () => {
        const config = buildDailyExcept([SUN])
        expect(runFullChain(config, ctx(SUN, "2026-05-03"))).toBe(false)
        expect(runFullChain(config, ctx(MON, "2026-05-04"))).toBe(true)
        expect(runFullChain(config, ctx(SAT, "2026-05-02"))).toBe(true)
    })
})

// ============================================================================
// OPÇÃO 4 — "SEMANAL"
// ============================================================================
describe("E2E — Opção 'Semanal'", () => {
    it("um único dia (segunda)", () => {
        const config = buildWeekly([MON])
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(MON, "2026-05-04"))).toBe(true)
        expect(runFullChain(config, ctx(TUE, "2026-04-28"))).toBe(false)
    })

    it("múltiplos dias (terça/quinta)", () => {
        const config = buildWeekly([TUE, THU])
        expect(runFullChain(config, ctx(TUE, "2026-04-28"))).toBe(true)
        expect(runFullChain(config, ctx(THU, "2026-04-30"))).toBe(true)
        expect(runFullChain(config, ctx(WED, "2026-04-29"))).toBe(false)
        expect(runFullChain(config, ctx(SAT, "2026-05-02"))).toBe(false)
    })

    it("toda a semana", () => {
        const config = buildWeekly([SUN, MON, TUE, WED, THU, FRI, SAT])
        for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
            expect(runFullChain(config, ctx(day, "2026-04-28"))).toBe(true)
        }
    })

    it("ordem de entrada não importa (builder ordena)", () => {
        const config = buildWeekly([FRI, MON, WED])
        expect(config.type === "weekly" && config.weekdays).toEqual([MON, WED, FRI])
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(WED, "2026-04-29"))).toBe(true)
        expect(runFullChain(config, ctx(FRI, "2026-05-01"))).toBe(true)
    })
})

// ============================================================================
// OPÇÃO 5 — "MENSAL"
// ============================================================================
describe("E2E — Opção 'Mensal: dia do mês'", () => {
    it("dia 15 — aparece no dia 15 de cada mês", () => {
        const config = buildMonthlyDayOfMonth(15)
        expect(runFullChain(config, ctx(WED, "2026-04-15"))).toBe(true)
        expect(runFullChain(config, ctx(FRI, "2026-05-15"))).toBe(true)
        expect(runFullChain(config, ctx(MON, "2026-06-15"))).toBe(true)
        expect(runFullChain(config, ctx(MON, "2026-04-14"))).toBe(false)
        expect(runFullChain(config, ctx(MON, "2026-04-16"))).toBe(false)
    })

    it("dia 31 — pula meses curtos (F.2)", () => {
        const config = buildMonthlyDayOfMonth(31)
        // Maio tem 31 → aparece
        expect(runFullChain(config, ctx(SUN, "2026-05-31"))).toBe(true)
        // Junho tem 30 → não aparece em nenhum dia
        for (let d = 1; d <= 30; d++) {
            const dk = `2026-06-${String(d).padStart(2, "0")}`
            expect(runFullChain(config, ctx(0, dk))).toBe(false)
        }
        // Fevereiro 2026 (não bissexto) → nunca aparece
        for (let d = 1; d <= 28; d++) {
            const dk = `2026-02-${String(d).padStart(2, "0")}`
            expect(runFullChain(config, ctx(0, dk))).toBe(false)
        }
    })

    it("dia 29 — em fevereiro só aparece em ano bissexto", () => {
        const config = buildMonthlyDayOfMonth(29)
        expect(runFullChain(config, ctx(THU, "2024-02-29"))).toBe(true) // bissexto
        // 2026 não bissexto: testar todos os dias de fev
        for (let d = 1; d <= 28; d++) {
            const dk = `2026-02-${String(d).padStart(2, "0")}`
            expect(runFullChain(config, ctx(0, dk))).toBe(false)
        }
    })
})

describe("E2E — Opção 'Mensal: padrão semanal'", () => {
    it("1ª segunda do mês (abril/2026 = 06)", () => {
        const config = buildMonthlyWeekdayPosition(MON, 1)
        expect(runFullChain(config, ctx(MON, "2026-04-06"))).toBe(true)
        expect(runFullChain(config, ctx(MON, "2026-04-13"))).toBe(false)
        expect(runFullChain(config, ctx(MON, "2026-05-04"))).toBe(true)
    })

    it("4ª segunda do mês (abril/2026 = 27)", () => {
        const config = buildMonthlyWeekdayPosition(MON, 4)
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(MON, "2026-04-20"))).toBe(false)
    })

    it("última (-1) quinta do mês (abril/2026 = 30; maio/2026 = 28)", () => {
        const config = buildMonthlyWeekdayPosition(THU, -1)
        expect(runFullChain(config, ctx(THU, "2026-04-30"))).toBe(true)
        expect(runFullChain(config, ctx(THU, "2026-04-23"))).toBe(false)
        expect(runFullChain(config, ctx(THU, "2026-05-28"))).toBe(true)
        expect(runFullChain(config, ctx(THU, "2026-05-21"))).toBe(false)
    })

    it("posição 4 quando mês só tem 3 ocorrências (não testável com weekOfMonth: 5, mas com 4 e mês de 4) — usa 4ª", () => {
        // Fev/2026: segundas em 2, 9, 16, 23 (4 segundas)
        const config = buildMonthlyWeekdayPosition(MON, 4)
        expect(runFullChain(config, ctx(MON, "2026-02-23"))).toBe(true)
    })
})

// ============================================================================
// OPÇÃO 6 — "ANUAL"
// ============================================================================
describe("E2E — Opção 'Anual: data específica'", () => {
    it("27 de abril em qualquer ano", () => {
        const config = buildYearlyDate(27, 4)
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(TUE, "2027-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(WED, "2028-04-27"))).toBe(true)
        // outros dias: false
        expect(runFullChain(config, ctx(SUN, "2026-04-26"))).toBe(false)
        expect(runFullChain(config, ctx(WED, "2026-05-27"))).toBe(false)
        expect(runFullChain(config, ctx(MON, "2026-03-27"))).toBe(false)
    })

    it("F.1: 29 de fevereiro só em ano bissexto", () => {
        const config = buildYearlyDate(29, 2)
        expect(runFullChain(config, ctx(THU, "2024-02-29"))).toBe(true)
        // 2026 não bissexto: nunca aparece
        for (let d = 1; d <= 28; d++) {
            const dk = `2026-02-${String(d).padStart(2, "0")}`
            expect(runFullChain(config, ctx(0, dk))).toBe(false)
        }
        // 2028 bissexto: 29/fev existe
        expect(runFullChain(config, ctx(TUE, "2028-02-29"))).toBe(true)
    })

    it("01/01 quando hoje é 28/04 → próxima ocorrência é 01/01 do ano seguinte", () => {
        const config = buildYearlyDate(1, 1)
        // Em 2026, hoje 28/04: 01/jan/2026 já passou — evaluator simplesmente
        // retorna false em qualquer data que não seja 01/01.
        expect(runFullChain(config, ctx(WED, "2026-04-28"))).toBe(false)
        // Em 01/01/2027 → true
        expect(runFullChain(config, ctx(FRI, "2027-01-01"))).toBe(true)
        expect(runFullChain(config, ctx(SAT, "2028-01-01"))).toBe(true)
    })
})

describe("E2E — Opção 'Anual: padrão semanal'", () => {
    it("2ª segunda de abril em qualquer ano", () => {
        const config = buildYearlyWeekdayPosition(MON, 2, 4)
        // 2ª segunda de abril/2026 = 13
        expect(runFullChain(config, ctx(MON, "2026-04-13"))).toBe(true)
        // outros dias do mesmo mês: false
        expect(runFullChain(config, ctx(MON, "2026-04-06"))).toBe(false)
        expect(runFullChain(config, ctx(MON, "2026-04-20"))).toBe(false)
        // outro mês: false (mesmo se for segunda)
        expect(runFullChain(config, ctx(MON, "2026-05-11"))).toBe(false)
    })

    it("última quinta de novembro (Thanksgiving)", () => {
        const config = buildYearlyWeekdayPosition(THU, -1, 11)
        // Última quinta de nov/2026: 26
        expect(runFullChain(config, ctx(THU, "2026-11-26"))).toBe(true)
        expect(runFullChain(config, ctx(THU, "2026-11-19"))).toBe(false) // 4ª (não última)
    })
})

// ============================================================================
// OPÇÃO 7 — "PERSONALIZAR" (rrule)
// ============================================================================
describe("E2E — Opção 'Personalizar' (rrule)", () => {
    it("FREQ=DAILY aparece todo dia", () => {
        const config = {
            version: 2 as const,
            type: "custom" as const,
            rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
        }
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(SUN, "2026-04-26"))).toBe(true)
    })

    it("FREQ=WEEKLY;BYDAY=MO,WE,FR aparece nesses dias", () => {
        const config = {
            version: 2 as const,
            type: "custom" as const,
            rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
        }
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(runFullChain(config, ctx(WED, "2026-04-29"))).toBe(true)
        expect(runFullChain(config, ctx(FRI, "2026-05-01"))).toBe(true)
        expect(runFullChain(config, ctx(TUE, "2026-04-28"))).toBe(false)
        expect(runFullChain(config, ctx(SAT, "2026-05-02"))).toBe(false)
    })

    it("UNTIL no passado retorna false", () => {
        const config = {
            version: 2 as const,
            type: "custom" as const,
            rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY;UNTIL=20260301T000000Z",
        }
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(false)
    })

    it("INTERVAL=2 (cada 2 semanas)", () => {
        // Começa 2026-01-05 (segunda) com FREQ=WEEKLY;INTERVAL=2;BYDAY=MO
        // Segundas que casam: 5/jan, 19/jan, 2/fev, ..., 27/abr (16 semanas)
        const config = {
            version: 2 as const,
            type: "custom" as const,
            rrule: "DTSTART:20260105T000000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
        }
        // 27/04/2026: dia 5 + (16 * 7) = dia 117 = 27/abr → casa
        expect(runFullChain(config, ctx(MON, "2026-04-27"))).toBe(true)
        // Segunda intermediária 20/04: dia 5 + 105 dias → 20/abr não é múltiplo de 14 desde 5/jan
        expect(runFullChain(config, ctx(MON, "2026-04-20"))).toBe(false)
    })
})
