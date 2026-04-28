import { describe, it, expect } from "vitest"
import { getNextOccurrences, type PreviewContext } from "../preview"

const SUN = 0
const MON = 1
const TUE = 2
const WED = 3
const THU = 4
const FRI = 5
const SAT = 6

// Hoje: 2026-04-28 (terça-feira)
function ctx(dateKey: string, dayOfWeek: number, extra: Partial<PreviewContext> = {}): PreviewContext {
    return { dateKey, dayOfWeek, ...extra }
}

describe("getNextOccurrences — daily", () => {
    it("5 ocorrências = 5 dias seguidos", () => {
        const result = getNextOccurrences(
            { version: 2, type: "daily" },
            ctx("2026-04-28", TUE),
        )
        expect(result).toHaveLength(5)
        expect(result![0].dateKey).toBe("2026-04-28")
        expect(result![1].dateKey).toBe("2026-04-29")
        expect(result![4].dateKey).toBe("2026-05-02")
    })

    it("inclui hoje como primeira ocorrência", () => {
        const result = getNextOccurrences(
            { version: 2, type: "daily" },
            ctx("2026-04-28", TUE),
        )
        expect(result![0].shortLabel).toBe("28/04")
    })
})

describe("getNextOccurrences — weekly", () => {
    it("weekdays=[1,3,5] retorna seg/qua/sex", () => {
        // Hoje 2026-04-28 (terça). Próximas: qua 29, sex 1, seg 4, qua 6, sex 8
        const result = getNextOccurrences(
            { version: 2, type: "weekly", weekdays: [MON, WED, FRI] },
            ctx("2026-04-28", TUE),
        )
        expect(result).toHaveLength(5)
        expect(result!.map((o) => o.dateKey)).toEqual([
            "2026-04-29", // qua
            "2026-05-01", // sex
            "2026-05-04", // seg
            "2026-05-06", // qua
            "2026-05-08", // sex
        ])
    })

    it("weekdays=[2] (terça) inclui hoje (terça) como primeira", () => {
        const result = getNextOccurrences(
            { version: 2, type: "weekly", weekdays: [TUE] },
            ctx("2026-04-28", TUE),
        )
        expect(result![0].dateKey).toBe("2026-04-28")
        expect(result![1].dateKey).toBe("2026-05-05")
    })

    it("weekdays=[0,6] (fins de semana)", () => {
        const result = getNextOccurrences(
            { version: 2, type: "weekly", weekdays: [SUN, SAT] },
            ctx("2026-04-28", TUE),
        )
        expect(result).toHaveLength(5)
        expect(result!.map((o) => o.dayOfWeek).every((d) => d === SAT || d === SUN)).toBe(true)
    })
})

describe("getNextOccurrences — shift_days", () => {
    it("usa days_of_week dos shifts correspondentes", () => {
        const result = getNextOccurrences(
            { version: 2, type: "shift_days" },
            ctx("2026-04-28", TUE, {
                shiftLabel: "morning",
                shifts: [{ shift_type: "morning", days_of_week: [MON, FRI] }],
            }),
        )
        expect(result!.map((o) => o.dayOfWeek).every((d) => d === MON || d === FRI)).toBe(true)
    })

    it("shift='any' = todo dia", () => {
        const result = getNextOccurrences(
            { version: 2, type: "shift_days" },
            ctx("2026-04-28", TUE, { shiftLabel: "any" }),
        )
        expect(result).toHaveLength(5)
    })
})

describe("getNextOccurrences — monthly", () => {
    it("day_of_month=15 → 15/05, 15/06, 15/07, 15/08, 15/09", () => {
        const result = getNextOccurrences(
            {
                version: 2,
                type: "monthly",
                mode: "day_of_month",
                day: 15,
            },
            ctx("2026-04-28", TUE),
        )
        expect(result).toHaveLength(5)
        expect(result!.map((o) => o.dateKey)).toEqual([
            "2026-05-15",
            "2026-06-15",
            "2026-07-15",
            "2026-08-15",
            "2026-09-15",
        ])
    })

    it("day_of_month=31 pula meses curtos", () => {
        const result = getNextOccurrences(
            {
                version: 2,
                type: "monthly",
                mode: "day_of_month",
                day: 31,
            },
            ctx("2026-04-28", TUE),
        )
        // Maio 31, Jul 31, Ago 31, Out 31, Dez 31 (Jun e Set não têm)
        expect(result!.map((o) => o.dateKey.slice(0, 7))).toEqual([
            "2026-05",
            "2026-07",
            "2026-08",
            "2026-10",
            "2026-12",
        ])
    })

    it("weekday_position: 1ª segunda do mês", () => {
        const result = getNextOccurrences(
            {
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: MON,
                weekOfMonth: 1,
            },
            ctx("2026-04-28", TUE),
        )
        // 1ª segunda de maio/2026 = 4. Junho = 1. Julho = 6. Agosto = 3. Set = 7.
        expect(result!.map((o) => o.dateKey)).toEqual([
            "2026-05-04",
            "2026-06-01",
            "2026-07-06",
            "2026-08-03",
            "2026-09-07",
        ])
    })

    it("weekday_position: última quinta do mês (-1)", () => {
        const result = getNextOccurrences(
            {
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: THU,
                weekOfMonth: -1,
            },
            ctx("2026-04-28", TUE),
        )
        // Última quinta de abril/2026 = 30, mai = 28, jun = 25, jul = 30, ago = 27
        expect(result!.map((o) => o.dateKey)).toEqual([
            "2026-04-30",
            "2026-05-28",
            "2026-06-25",
            "2026-07-30",
            "2026-08-27",
        ])
    })
})

describe("getNextOccurrences — yearly", () => {
    it("mode='date' day=27 month=4 retorna 5 anos de ocorrências", () => {
        // hoje é 28/abr/2026; próxima 27/abr é em 2027
        const result = getNextOccurrences(
            {
                version: 2,
                type: "yearly",
                mode: "date",
                day: 27,
                month: 4,
            },
            ctx("2026-04-28", TUE),
        )
        expect(result).toHaveLength(5)
        expect(result!.map((o) => o.dateKey)).toEqual([
            "2027-04-27",
            "2028-04-27",
            "2029-04-27",
            "2030-04-27",
            "2031-04-27",
        ])
    })

    it("mode='date' day=28 month=4 inclui hoje", () => {
        const result = getNextOccurrences(
            {
                version: 2,
                type: "yearly",
                mode: "date",
                day: 28,
                month: 4,
            },
            ctx("2026-04-28", TUE),
        )
        expect(result).toHaveLength(5)
        expect(result![0].dateKey).toBe("2026-04-28")
    })

    it("mode='weekday_position': 2ª segunda de maio", () => {
        const result = getNextOccurrences(
            {
                version: 2,
                type: "yearly",
                mode: "weekday_position",
                weekday: MON,
                weekOfMonth: 2,
                month: 5,
            },
            ctx("2026-04-28", TUE),
        )
        // 2ª segunda de maio/2026 = 11; espera 5 anos seguidos
        expect(result).toHaveLength(5)
        expect(result![0].dateKey).toBe("2026-05-11")
    })
})

describe("getNextOccurrences — custom retorna null", () => {
    it("custom não é avaliado no client", () => {
        const result = getNextOccurrences(
            {
                version: 2,
                type: "custom",
                rrule: "FREQ=DAILY",
            },
            ctx("2026-04-28", TUE),
        )
        expect(result).toBeNull()
    })
})

describe("getNextOccurrences — limites", () => {
    it("respeita maxDays mesmo se count não foi atingido", () => {
        // weekly só sábado, com maxDays curto
        const result = getNextOccurrences(
            { version: 2, type: "weekly", weekdays: [SAT] },
            ctx("2026-04-28", TUE),
            10, // count
            14, // maxDays — só vai pegar 2 sábados (3/5 e 10/5)
        )
        expect(result!.length).toBeLessThanOrEqual(2)
    })

    it("count customizado", () => {
        const result = getNextOccurrences(
            { version: 2, type: "daily" },
            ctx("2026-04-28", TUE),
            3,
        )
        expect(result).toHaveLength(3)
    })

    it("dateKey inválido retorna []", () => {
        const result = getNextOccurrences(
            { version: 2, type: "daily" },
            ctx("data-quebrada", TUE),
        )
        expect(result).toEqual([])
    })
})
