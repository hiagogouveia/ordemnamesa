import { describe, it, expect } from "vitest"
import { validateV2, RecurrenceValidationError } from "../validate"

describe("validateV2 — rejeição de inputs inválidos", () => {
    it("rejeita null", () => {
        expect(() => validateV2(null)).toThrow(RecurrenceValidationError)
    })

    it("rejeita undefined", () => {
        expect(() => validateV2(undefined)).toThrow(RecurrenceValidationError)
    })

    it("rejeita string", () => {
        expect(() => validateV2("daily")).toThrow(RecurrenceValidationError)
    })

    it("rejeita array", () => {
        expect(() => validateV2([])).toThrow(RecurrenceValidationError)
    })

    it("rejeita objeto sem version", () => {
        expect(() => validateV2({ type: "daily" })).toThrow(RecurrenceValidationError)
    })

    it("rejeita version=1", () => {
        expect(() => validateV2({ version: 1, type: "daily" })).toThrow(
            RecurrenceValidationError,
        )
    })

    it("rejeita version='2' (string, não numérico)", () => {
        expect(() => validateV2({ version: "2", type: "daily" })).toThrow(
            RecurrenceValidationError,
        )
    })

    it("rejeita type ausente", () => {
        expect(() => validateV2({ version: 2 })).toThrow(RecurrenceValidationError)
    })

    it("rejeita type desconhecido", () => {
        expect(() => validateV2({ version: 2, type: "biweekly" })).toThrow(
            RecurrenceValidationError,
        )
    })
})

describe("validateV2 — daily", () => {
    it("aceita daily simples", () => {
        expect(validateV2({ version: 2, type: "daily" })).toEqual({
            version: 2,
            type: "daily",
        })
    })

    it("descarta campos extras (não normaliza, mas aceita)", () => {
        // Note: o validador devolve apenas os campos esperados (whitelist).
        const result = validateV2({ version: 2, type: "daily", extra: "ignored" })
        expect(result).toEqual({ version: 2, type: "daily" })
    })
})

describe("validateV2 — shift_days", () => {
    it("aceita shift_days", () => {
        expect(validateV2({ version: 2, type: "shift_days" })).toEqual({
            version: 2,
            type: "shift_days",
        })
    })
})

describe("validateV2 — weekly", () => {
    it("aceita weekly com weekdays válido", () => {
        expect(
            validateV2({ version: 2, type: "weekly", weekdays: [1, 3, 5] }),
        ).toEqual({ version: 2, type: "weekly", weekdays: [1, 3, 5] })
    })

    it("rejeita weekly sem weekdays", () => {
        expect(() => validateV2({ version: 2, type: "weekly" })).toThrow(
            RecurrenceValidationError,
        )
    })

    it("REJEITA weekly com weekdays vazio (F.4)", () => {
        expect(() =>
            validateV2({ version: 2, type: "weekly", weekdays: [] }),
        ).toThrow(/não pode ser vazio/)
    })

    it("rejeita weekly com weekday fora do range 0-6", () => {
        expect(() =>
            validateV2({ version: 2, type: "weekly", weekdays: [7] }),
        ).toThrow(RecurrenceValidationError)
        expect(() =>
            validateV2({ version: 2, type: "weekly", weekdays: [-1] }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita weekly com weekdays não-array", () => {
        expect(() =>
            validateV2({ version: 2, type: "weekly", weekdays: "1,3,5" }),
        ).toThrow(RecurrenceValidationError)
    })

    it("deduplica e ordena weekdays", () => {
        expect(
            validateV2({ version: 2, type: "weekly", weekdays: [5, 1, 3, 1] }),
        ).toEqual({ version: 2, type: "weekly", weekdays: [1, 3, 5] })
    })
})

describe("validateV2 — monthly day_of_month", () => {
    it("aceita day=15", () => {
        expect(
            validateV2({
                version: 2,
                type: "monthly",
                mode: "day_of_month",
                day: 15,
            }),
        ).toEqual({ version: 2, type: "monthly", mode: "day_of_month", day: 15 })
    })

    it("aceita day=1 e day=31", () => {
        expect(
            validateV2({ version: 2, type: "monthly", mode: "day_of_month", day: 1 }),
        ).toBeTruthy()
        expect(
            validateV2({
                version: 2,
                type: "monthly",
                mode: "day_of_month",
                day: 31,
            }),
        ).toBeTruthy()
    })

    it("rejeita day=0", () => {
        expect(() =>
            validateV2({ version: 2, type: "monthly", mode: "day_of_month", day: 0 }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita day=32", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "monthly",
                mode: "day_of_month",
                day: 32,
            }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita day não inteiro", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "monthly",
                mode: "day_of_month",
                day: 1.5,
            }),
        ).toThrow(RecurrenceValidationError)
    })
})

describe("validateV2 — monthly weekday_position", () => {
    it("aceita 2ª segunda do mês", () => {
        expect(
            validateV2({
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: 1,
                weekOfMonth: 2,
            }),
        ).toEqual({
            version: 2,
            type: "monthly",
            mode: "weekday_position",
            weekday: 1,
            weekOfMonth: 2,
        })
    })

    it("aceita última (-1) quinta do mês", () => {
        expect(
            validateV2({
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: 4,
                weekOfMonth: -1,
            }),
        ).toEqual({
            version: 2,
            type: "monthly",
            mode: "weekday_position",
            weekday: 4,
            weekOfMonth: -1,
        })
    })

    it("rejeita weekOfMonth=5", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: 1,
                weekOfMonth: 5,
            }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita weekOfMonth=0", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: 1,
                weekOfMonth: 0,
            }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita weekday=7", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: 7,
                weekOfMonth: 1,
            }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita mode desconhecido", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "monthly",
                mode: "every_other",
                day: 15,
            }),
        ).toThrow(RecurrenceValidationError)
    })
})

describe("validateV2 — yearly date", () => {
    it("aceita 27 de abril", () => {
        expect(
            validateV2({
                version: 2,
                type: "yearly",
                mode: "date",
                day: 27,
                month: 4,
            }),
        ).toEqual({
            version: 2,
            type: "yearly",
            mode: "date",
            day: 27,
            month: 4,
        })
    })

    it("aceita 29/fev mesmo sem ser bissexto (evaluator pula)", () => {
        expect(
            validateV2({
                version: 2,
                type: "yearly",
                mode: "date",
                day: 29,
                month: 2,
            }),
        ).toBeTruthy()
    })

    it("rejeita month=13", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "yearly",
                mode: "date",
                day: 1,
                month: 13,
            }),
        ).toThrow(RecurrenceValidationError)
    })
})

describe("validateV2 — yearly weekday_position", () => {
    it("aceita 2ª segunda de abril", () => {
        expect(
            validateV2({
                version: 2,
                type: "yearly",
                mode: "weekday_position",
                weekday: 1,
                weekOfMonth: 2,
                month: 4,
            }),
        ).toEqual({
            version: 2,
            type: "yearly",
            mode: "weekday_position",
            weekday: 1,
            weekOfMonth: 2,
            month: 4,
        })
    })

    it("rejeita month inválido", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "yearly",
                mode: "weekday_position",
                weekday: 1,
                weekOfMonth: 1,
                month: 0,
            }),
        ).toThrow(RecurrenceValidationError)
    })
})

describe("validateV2 — custom (rrule)", () => {
    it("aceita rrule válida básica", () => {
        const rrule = "FREQ=WEEKLY;BYDAY=MO,WE,FR"
        expect(validateV2({ version: 2, type: "custom", rrule })).toEqual({
            version: 2,
            type: "custom",
            rrule,
        })
    })

    it("aceita rrule com COUNT", () => {
        const rrule = "FREQ=DAILY;COUNT=10"
        expect(validateV2({ version: 2, type: "custom", rrule })).toBeTruthy()
    })

    it("aceita rrule com UNTIL", () => {
        const rrule = "FREQ=WEEKLY;UNTIL=20271231T235959Z"
        expect(validateV2({ version: 2, type: "custom", rrule })).toBeTruthy()
    })

    it("rejeita rrule vazia", () => {
        expect(() =>
            validateV2({ version: 2, type: "custom", rrule: "" }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita rrule só com espaço", () => {
        expect(() =>
            validateV2({ version: 2, type: "custom", rrule: "   " }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita rrule não-string", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "custom",
                rrule: { freq: "WEEKLY" },
            }),
        ).toThrow(RecurrenceValidationError)
    })

    it("rejeita rrule sintaticamente inválida", () => {
        expect(() =>
            validateV2({
                version: 2,
                type: "custom",
                rrule: "FREQ=BANANA",
            }),
        ).toThrow(RecurrenceValidationError)
    })
})
