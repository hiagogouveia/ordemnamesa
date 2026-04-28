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

describe("buildDailyExcept", () => {
    it("sem exceções → daily puro", () => {
        expect(buildDailyExcept([])).toEqual({ version: 2, type: "daily" })
    })

    it("excluindo sábado e domingo → weekly seg-sex", () => {
        expect(buildDailyExcept([0, 6])).toEqual({
            version: 2,
            type: "weekly",
            weekdays: [1, 2, 3, 4, 5],
        })
    })

    it("excluindo só domingo → weekly seg-sáb", () => {
        expect(buildDailyExcept([0])).toEqual({
            version: 2,
            type: "weekly",
            weekdays: [1, 2, 3, 4, 5, 6],
        })
    })

    it("excluindo todos os dias → weekly vazio (validador rejeita depois)", () => {
        // O builder não valida — UI deve impedir todos selecionados
        expect(buildDailyExcept([0, 1, 2, 3, 4, 5, 6])).toEqual({
            version: 2,
            type: "weekly",
            weekdays: [],
        })
    })

    it("output passa pelo validateV2 com input válido", () => {
        expect(() => validateV2(buildDailyExcept([6]))).not.toThrow()
    })
})

describe("buildWeekly", () => {
    it("ordena weekdays", () => {
        expect(buildWeekly([5, 1, 3])).toEqual({
            version: 2,
            type: "weekly",
            weekdays: [1, 3, 5],
        })
    })

    it("output passa pelo validateV2", () => {
        expect(() => validateV2(buildWeekly([1, 3]))).not.toThrow()
    })
})

describe("buildMonthlyDayOfMonth", () => {
    it("dia 15", () => {
        expect(buildMonthlyDayOfMonth(15)).toEqual({
            version: 2,
            type: "monthly",
            mode: "day_of_month",
            day: 15,
        })
    })

    it("output passa pelo validateV2", () => {
        expect(() => validateV2(buildMonthlyDayOfMonth(1))).not.toThrow()
        expect(() => validateV2(buildMonthlyDayOfMonth(31))).not.toThrow()
    })
})

describe("buildMonthlyWeekdayPosition", () => {
    it("2ª segunda do mês", () => {
        expect(buildMonthlyWeekdayPosition(1, 2)).toEqual({
            version: 2,
            type: "monthly",
            mode: "weekday_position",
            weekday: 1,
            weekOfMonth: 2,
        })
    })

    it("última (-1) quinta do mês", () => {
        expect(buildMonthlyWeekdayPosition(4, -1)).toEqual({
            version: 2,
            type: "monthly",
            mode: "weekday_position",
            weekday: 4,
            weekOfMonth: -1,
        })
    })

    it("output passa pelo validateV2", () => {
        expect(() => validateV2(buildMonthlyWeekdayPosition(1, 1))).not.toThrow()
        expect(() => validateV2(buildMonthlyWeekdayPosition(6, -1))).not.toThrow()
    })
})

describe("buildYearlyDate", () => {
    it("27 de abril", () => {
        expect(buildYearlyDate(27, 4)).toEqual({
            version: 2,
            type: "yearly",
            mode: "date",
            day: 27,
            month: 4,
        })
    })

    it("output passa pelo validateV2", () => {
        expect(() => validateV2(buildYearlyDate(1, 1))).not.toThrow()
        expect(() => validateV2(buildYearlyDate(31, 12))).not.toThrow()
    })
})

describe("buildYearlyWeekdayPosition", () => {
    it("2ª segunda de abril", () => {
        expect(buildYearlyWeekdayPosition(1, 2, 4)).toEqual({
            version: 2,
            type: "yearly",
            mode: "weekday_position",
            weekday: 1,
            weekOfMonth: 2,
            month: 4,
        })
    })

    it("output passa pelo validateV2", () => {
        expect(() =>
            validateV2(buildYearlyWeekdayPosition(0, -1, 12)),
        ).not.toThrow()
    })
})
