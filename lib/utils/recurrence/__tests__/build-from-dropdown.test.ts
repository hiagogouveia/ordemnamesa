import { describe, it, expect } from "vitest"
import {
    buildV2FromDropdownOption,
    computeWeekOfMonth,
} from "../build-from-dropdown"

const CTX = { day: 27, month: 4, weekday: 1, weekOfMonth: -1 as const }

describe("buildV2FromDropdownOption", () => {
    it("daily", () => {
        expect(buildV2FromDropdownOption("daily", CTX)).toEqual({
            version: 2,
            type: "daily",
        })
    })

    it("shift_days", () => {
        expect(buildV2FromDropdownOption("shift_days", CTX)).toEqual({
            version: 2,
            type: "shift_days",
        })
    })

    it("weekdays vira weekly com [1..5]", () => {
        expect(buildV2FromDropdownOption("weekdays", CTX)).toEqual({
            version: 2,
            type: "weekly",
            weekdays: [1, 2, 3, 4, 5],
        })
    })

    it("weekly persiste o dia atual", () => {
        expect(
            buildV2FromDropdownOption("weekly", { ...CTX, weekday: 3 }),
        ).toEqual({ version: 2, type: "weekly", weekdays: [3] })
    })

    it("monthly persiste weekday + weekOfMonth do contexto", () => {
        expect(
            buildV2FromDropdownOption("monthly", {
                ...CTX,
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

    it("monthly aceita weekOfMonth=-1 (última)", () => {
        expect(
            buildV2FromDropdownOption("monthly", {
                ...CTX,
                weekOfMonth: -1,
            }),
        ).toEqual({
            version: 2,
            type: "monthly",
            mode: "weekday_position",
            weekday: 1,
            weekOfMonth: -1,
        })
    })

    it("yearly persiste day + month do contexto", () => {
        expect(
            buildV2FromDropdownOption("yearly", {
                ...CTX,
                day: 15,
                month: 9,
            }),
        ).toEqual({
            version: 2,
            type: "yearly",
            mode: "date",
            day: 15,
            month: 9,
        })
    })
})

describe("computeWeekOfMonth", () => {
    it("primeiro dia do mês na primeira ocorrência → 1", () => {
        // 7 de abril/2026 = primeira terça
        expect(computeWeekOfMonth(7, 30)).toBe(1)
    })

    it("dia 14 (segunda ocorrência) → 2", () => {
        expect(computeWeekOfMonth(14, 30)).toBe(2)
    })

    it("dia 21 (terceira ocorrência) → 3", () => {
        expect(computeWeekOfMonth(21, 30)).toBe(3)
    })

    it("dia 24 em mês de 30 dias → -1 (última, próxima cai mês seguinte)", () => {
        expect(computeWeekOfMonth(24, 30)).toBe(-1)
    })

    it("dia 23 em mês de 28 dias → -1 (última)", () => {
        // 23 + 7 = 30 > 28 → última
        expect(computeWeekOfMonth(23, 28)).toBe(-1)
    })

    it("dia 22 em mês de 28 dias → -1 (próxima ainda no mês)", () => {
        // Espera: 22 + 7 = 29 > 28 → última
        expect(computeWeekOfMonth(22, 28)).toBe(-1)
    })

    it("dia 21 em mês de 28 dias → 3 (próxima dia 28 ainda no mês)", () => {
        // 21 + 7 = 28 → não é > 28 → ordinal 3
        expect(computeWeekOfMonth(21, 28)).toBe(3)
    })

    it("dia 29 em mês com 31 dias → -1 (última)", () => {
        // 29 + 7 = 36 > 31 → última
        expect(computeWeekOfMonth(29, 31)).toBe(-1)
    })

    it("dia 30 em mês com 30 dias → -1 (última)", () => {
        expect(computeWeekOfMonth(30, 30)).toBe(-1)
    })
})
