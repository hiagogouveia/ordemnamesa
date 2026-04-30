import { describe, it, expect } from "vitest"
import { describeRecurrence } from "../describe"

describe("describeRecurrence — v2", () => {
    it("daily", () => {
        expect(
            describeRecurrence({
                recurrence: "daily",
                recurrence_config: { version: 2, type: "daily" },
            }),
        ).toBe("Todos os dias")
    })

    it("shift_days", () => {
        expect(
            describeRecurrence({
                recurrence: "shift_days",
                recurrence_config: { version: 2, type: "shift_days" },
            }),
        ).toBe("Dias do turno")
    })

    it("weekly um dia → 'Toda terça-feira'", () => {
        expect(
            describeRecurrence({
                recurrence: "weekly",
                recurrence_config: { version: 2, type: "weekly", weekdays: [2] },
            }),
        ).toBe("Toda terça-feira")
    })

    it("weekly seg-sex → 'Dias úteis'", () => {
        expect(
            describeRecurrence({
                recurrence: "weekly",
                recurrence_config: { version: 2, type: "weekly", weekdays: [1, 2, 3, 4, 5] },
            }),
        ).toBe("Dias úteis (seg-sex)")
    })

    it("weekly sáb-dom → 'Fins de semana'", () => {
        expect(
            describeRecurrence({
                recurrence: "weekly",
                recurrence_config: { version: 2, type: "weekly", weekdays: [0, 6] },
            }),
        ).toBe("Fins de semana")
    })

    it("weekly múltiplos dias arbitrários", () => {
        expect(
            describeRecurrence({
                recurrence: "weekly",
                recurrence_config: { version: 2, type: "weekly", weekdays: [1, 3, 5] },
            }),
        ).toBe("Semanal: seg, qua, sex")
    })

    it("monthly day_of_month", () => {
        expect(
            describeRecurrence({
                recurrence: "monthly",
                recurrence_config: {
                    version: 2,
                    type: "monthly",
                    mode: "day_of_month",
                    day: 15,
                },
            }),
        ).toBe("Mensal: dia 15")
    })

    it("monthly weekday_position com -1 (última)", () => {
        expect(
            describeRecurrence({
                recurrence: "monthly",
                recurrence_config: {
                    version: 2,
                    type: "monthly",
                    mode: "weekday_position",
                    weekday: 4,
                    weekOfMonth: -1,
                },
            }),
        ).toBe("Mensal: última quinta-feira do mês")
    })

    it("monthly weekday_position com 2", () => {
        expect(
            describeRecurrence({
                recurrence: "monthly",
                recurrence_config: {
                    version: 2,
                    type: "monthly",
                    mode: "weekday_position",
                    weekday: 1,
                    weekOfMonth: 2,
                },
            }),
        ).toBe("Mensal: segunda segunda-feira do mês")
    })

    it("yearly date", () => {
        expect(
            describeRecurrence({
                recurrence: "yearly",
                recurrence_config: {
                    version: 2,
                    type: "yearly",
                    mode: "date",
                    day: 27,
                    month: 4,
                },
            }),
        ).toBe("Anual em 27 de abril")
    })

    it("yearly weekday_position", () => {
        expect(
            describeRecurrence({
                recurrence: "yearly",
                recurrence_config: {
                    version: 2,
                    type: "yearly",
                    mode: "weekday_position",
                    weekday: 1,
                    weekOfMonth: 2,
                    month: 4,
                },
            }),
        ).toBe("Anual: segunda segunda-feira de abril")
    })

    it("custom", () => {
        expect(
            describeRecurrence({
                recurrence: "custom",
                recurrence_config: {
                    version: 2,
                    type: "custom",
                    rrule: "FREQ=DAILY",
                },
            }),
        ).toBe("Personalizada")
    })
})

describe("describeRecurrence — v1 legacy", () => {
    it("daily", () => {
        expect(describeRecurrence({ recurrence: "daily" })).toBe("Todos os dias")
    })

    it("weekdays", () => {
        expect(describeRecurrence({ recurrence: "weekdays" })).toBe(
            "Dias úteis (seg-sex)",
        )
    })

    it("weekly v1 (sem dia armazenado)", () => {
        expect(describeRecurrence({ recurrence: "weekly" })).toBe("Semanal")
    })

    it("monthly v1", () => {
        expect(describeRecurrence({ recurrence: "monthly" })).toBe("Mensal")
    })

    it("yearly v1", () => {
        expect(describeRecurrence({ recurrence: "yearly" })).toBe("Anual")
    })

    it("custom v1 com days_of_week=[1]", () => {
        expect(
            describeRecurrence({
                recurrence: "custom",
                recurrence_config: {
                    frequency: "weekly",
                    interval: 1,
                    days_of_week: [1],
                    end_type: "never",
                },
            }),
        ).toBe("Toda segunda-feira")
    })

    it("custom v1 sem config", () => {
        expect(describeRecurrence({ recurrence: "custom" })).toBe("Personalizada")
    })

    it("recurrence ausente", () => {
        expect(describeRecurrence({})).toBe("Sem recorrência")
    })
})

describe("describeRecurrence — config v1 disfarçada (sem version) cai em v1", () => {
    it("config v1 com frequency='weekly' não é tratada como v2", () => {
        expect(
            describeRecurrence({
                recurrence: "weekly",
                recurrence_config: {
                    frequency: "weekly",
                    interval: 1,
                    days_of_week: [2, 4],
                    end_type: "never",
                },
            }),
        ).toBe("Semanal") // recurrence='weekly' v1 não usa days_of_week
    })
})
