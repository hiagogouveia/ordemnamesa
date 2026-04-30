import { describe, it, expect } from "vitest"
import { evaluateV2, type EvaluateContext } from "../evaluate"

const SUN = 0
const MON = 1
const TUE = 2
const WED = 3
const THU = 4
const FRI = 5
const SAT = 6

// 2026-04-27 = segunda-feira (4ª segunda de abril, última segunda de abril)
// 2026-04-30 = quinta-feira (5ª/última quinta de abril)
// 2026-02-27 = sexta-feira (4ª/última sexta de fevereiro)

function ctx(dayOfWeek: number, dateKey: string, extra: Partial<EvaluateContext> = {}): EvaluateContext {
    return { dayOfWeek, dateKey, ...extra }
}

describe("evaluateV2 — daily", () => {
    it("sempre true", () => {
        for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
            expect(evaluateV2({ version: 2, type: "daily" }, ctx(day, "2026-04-27"))).toBe(true)
        }
    })
})

describe("evaluateV2 — weekly", () => {
    it("aparece nos weekdays listados", () => {
        const config = { version: 2 as const, type: "weekly" as const, weekdays: [MON, WED, FRI] }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(evaluateV2(config, ctx(WED, "2026-04-29"))).toBe(true)
        expect(evaluateV2(config, ctx(FRI, "2026-05-01"))).toBe(true)
    })

    it("não aparece nos demais dias", () => {
        const config = { version: 2 as const, type: "weekly" as const, weekdays: [MON, WED, FRI] }
        expect(evaluateV2(config, ctx(TUE, "2026-04-28"))).toBe(false)
        expect(evaluateV2(config, ctx(THU, "2026-04-30"))).toBe(false)
        expect(evaluateV2(config, ctx(SAT, "2026-05-02"))).toBe(false)
        expect(evaluateV2(config, ctx(SUN, "2026-05-03"))).toBe(false)
    })

    it("apenas um dia listado", () => {
        const config = { version: 2 as const, type: "weekly" as const, weekdays: [TUE] }
        expect(evaluateV2(config, ctx(TUE, "2026-04-28"))).toBe(true)
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(false)
    })
})

describe("evaluateV2 — shift_days", () => {
    it("shift='any' sempre true", () => {
        expect(
            evaluateV2(
                { version: 2, type: "shift_days" },
                ctx(MON, "2026-04-27", { shiftLabel: "any" }),
            ),
        ).toBe(true)
    })

    it("sem shifts → fallback true", () => {
        expect(
            evaluateV2(
                { version: 2, type: "shift_days" },
                ctx(MON, "2026-04-27", { shiftLabel: "morning", shifts: [] }),
            ),
        ).toBe(true)
    })

    it("dia listado em shift correspondente → true", () => {
        expect(
            evaluateV2(
                { version: 2, type: "shift_days" },
                ctx(MON, "2026-04-27", {
                    shiftLabel: "morning",
                    shifts: [{ shift_type: "morning", days_of_week: [MON, WED, FRI] }],
                }),
            ),
        ).toBe(true)
    })

    it("dia NÃO listado em shift correspondente → false", () => {
        expect(
            evaluateV2(
                { version: 2, type: "shift_days" },
                ctx(TUE, "2026-04-28", {
                    shiftLabel: "morning",
                    shifts: [{ shift_type: "morning", days_of_week: [MON, WED, FRI] }],
                }),
            ),
        ).toBe(false)
    })
})

describe("evaluateV2 — monthly day_of_month", () => {
    it("aparece no dia exato do mês", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "day_of_month" as const,
            day: 15,
        }
        expect(evaluateV2(config, ctx(WED, "2026-04-15"))).toBe(true)
        expect(evaluateV2(config, ctx(FRI, "2026-05-15"))).toBe(true)
    })

    it("não aparece nos demais dias", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "day_of_month" as const,
            day: 15,
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(false)
    })

    it("F.2: dia 31 em mês com 30 dias → false", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "day_of_month" as const,
            day: 31,
        }
        // Abril/2026 tem 30 dias — testar todos os dias do mês: nenhum deve aparecer
        for (let d = 1; d <= 30; d++) {
            const dateKey = `2026-04-${String(d).padStart(2, "0")}`
            expect(evaluateV2(config, ctx(0, dateKey))).toBe(false)
        }
    })

    it("F.2: dia 31 em mês com 31 dias → aparece em 31", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "day_of_month" as const,
            day: 31,
        }
        expect(evaluateV2(config, ctx(SUN, "2026-05-31"))).toBe(true)
    })

    it("F.2: dia 29 em fevereiro/2026 (28 dias) → false em todos os dias", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "day_of_month" as const,
            day: 29,
        }
        for (let d = 1; d <= 28; d++) {
            const dateKey = `2026-02-${String(d).padStart(2, "0")}`
            expect(evaluateV2(config, ctx(0, dateKey))).toBe(false)
        }
    })

    it("F.2: dia 29 em fevereiro/2024 (bissexto) → aparece em 29", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "day_of_month" as const,
            day: 29,
        }
        expect(evaluateV2(config, ctx(THU, "2024-02-29"))).toBe(true)
    })
})

describe("evaluateV2 — monthly weekday_position", () => {
    it("4ª segunda de abril/2026 = 27", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "weekday_position" as const,
            weekday: MON,
            weekOfMonth: 4 as const,
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(evaluateV2(config, ctx(MON, "2026-04-20"))).toBe(false) // 3ª
    })

    it("última (-1) segunda de abril/2026 = 27", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "weekday_position" as const,
            weekday: MON,
            weekOfMonth: -1 as const,
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(evaluateV2(config, ctx(MON, "2026-04-20"))).toBe(false)
    })

    it("última (-1) quinta de abril/2026 = 30 (mês com 5 quintas)", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "weekday_position" as const,
            weekday: THU,
            weekOfMonth: -1 as const,
        }
        expect(evaluateV2(config, ctx(THU, "2026-04-30"))).toBe(true)
        expect(evaluateV2(config, ctx(THU, "2026-04-23"))).toBe(false) // 4ª, não a última
    })

    it("F.3: 4ª segunda em mês com apenas 4 → aparece (4 existe)", () => {
        // Abril/2026: segundas em 6, 13, 20, 27 (4 segundas)
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "weekday_position" as const,
            weekday: MON,
            weekOfMonth: 4 as const,
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(true)
    })

    it("F.3: posição 4 em fevereiro/2026 com apenas 4 segundas → última segunda", () => {
        // Fev/2026: segundas em 2, 9, 16, 23 (4 segundas) — 4ª = 23
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "weekday_position" as const,
            weekday: MON,
            weekOfMonth: 4 as const,
        }
        expect(evaluateV2(config, ctx(MON, "2026-02-23"))).toBe(true)
    })

    it("não aparece em outros dias do mês", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "weekday_position" as const,
            weekday: MON,
            weekOfMonth: 2 as const,
        }
        // 2ª segunda de abril/2026 = 13
        expect(evaluateV2(config, ctx(MON, "2026-04-13"))).toBe(true)
        expect(evaluateV2(config, ctx(MON, "2026-04-06"))).toBe(false)
        expect(evaluateV2(config, ctx(MON, "2026-04-20"))).toBe(false)
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(false)
    })
})

describe("evaluateV2 — yearly date", () => {
    it("aparece em 27 de abril", () => {
        const config = {
            version: 2 as const,
            type: "yearly" as const,
            mode: "date" as const,
            day: 27,
            month: 4,
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(evaluateV2(config, ctx(TUE, "2027-04-27"))).toBe(true)
    })

    it("não aparece em outros dias", () => {
        const config = {
            version: 2 as const,
            type: "yearly" as const,
            mode: "date" as const,
            day: 27,
            month: 4,
        }
        expect(evaluateV2(config, ctx(SUN, "2026-04-26"))).toBe(false)
        expect(evaluateV2(config, ctx(WED, "2026-05-27"))).toBe(false)
        expect(evaluateV2(config, ctx(MON, "2026-03-27"))).toBe(false)
    })

    it("F.1: 29/fev em ano não bissexto → false", () => {
        const config = {
            version: 2 as const,
            type: "yearly" as const,
            mode: "date" as const,
            day: 29,
            month: 2,
        }
        // 2026 não é bissexto: testar todos os dias de fevereiro
        for (let d = 1; d <= 28; d++) {
            const dateKey = `2026-02-${String(d).padStart(2, "0")}`
            expect(evaluateV2(config, ctx(0, dateKey))).toBe(false)
        }
    })

    it("F.1: 29/fev em 2024 (bissexto) → true em 29", () => {
        const config = {
            version: 2 as const,
            type: "yearly" as const,
            mode: "date" as const,
            day: 29,
            month: 2,
        }
        expect(evaluateV2(config, ctx(THU, "2024-02-29"))).toBe(true)
    })
})

describe("evaluateV2 — yearly weekday_position", () => {
    it("2ª segunda de abril em qualquer ano", () => {
        const config = {
            version: 2 as const,
            type: "yearly" as const,
            mode: "weekday_position" as const,
            weekday: MON,
            weekOfMonth: 2 as const,
            month: 4,
        }
        // 2ª segunda de abril/2026 = 13
        expect(evaluateV2(config, ctx(MON, "2026-04-13"))).toBe(true)
        // outros meses devem ser falsos
        expect(evaluateV2(config, ctx(MON, "2026-05-11"))).toBe(false)
    })

    it("última quinta de junho", () => {
        const config = {
            version: 2 as const,
            type: "yearly" as const,
            mode: "weekday_position" as const,
            weekday: THU,
            weekOfMonth: -1 as const,
            month: 6,
        }
        // Última quinta de junho/2026: 25
        expect(evaluateV2(config, ctx(THU, "2026-06-25"))).toBe(true)
        expect(evaluateV2(config, ctx(THU, "2026-06-18"))).toBe(false)
    })
})

describe("evaluateV2 — custom (rrule)", () => {
    it("FREQ=DAILY aparece todo dia", () => {
        const config = { version: 2 as const, type: "custom" as const, rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY" }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(evaluateV2(config, ctx(SUN, "2026-04-26"))).toBe(true)
    })

    it("FREQ=WEEKLY;BYDAY=MO aparece só nas segundas", () => {
        const config = {
            version: 2 as const,
            type: "custom" as const,
            rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO",
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(true)
        expect(evaluateV2(config, ctx(TUE, "2026-04-28"))).toBe(false)
    })

    it("UNTIL no passado retorna false", () => {
        const config = {
            version: 2 as const,
            type: "custom" as const,
            rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY;UNTIL=20260301T000000Z",
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(false)
    })

    it("rrule inválida retorna false (fail-closed)", () => {
        const config = {
            version: 2 as const,
            type: "custom" as const,
            rrule: "FREQ=BANANA",
        }
        expect(evaluateV2(config, ctx(MON, "2026-04-27"))).toBe(false)
    })
})

describe("evaluateV2 — dateKey malformado", () => {
    it("retorna false em vez de throw", () => {
        const config = {
            version: 2 as const,
            type: "monthly" as const,
            mode: "day_of_month" as const,
            day: 15,
        }
        expect(evaluateV2(config, ctx(MON, "data-invalida"))).toBe(false)
        expect(evaluateV2(config, ctx(MON, ""))).toBe(false)
    })
})
