import { describe, it, expect } from "vitest"
import { RRule } from "rrule"
import { legacyConfigToV2Rrule } from "../legacy-to-v2-rrule"
import { validateV2 } from "../validate"

describe("legacyConfigToV2Rrule", () => {
    it("daily simples", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "daily",
            interval: 1,
            end_type: "never",
        })
        expect(result).toEqual({ version: 2, type: "custom", rrule: "FREQ=DAILY" })
    })

    it("daily com interval=3", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "daily",
            interval: 3,
            end_type: "never",
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(result.rrule).toBe("FREQ=DAILY;INTERVAL=3")
    })

    it("weekly com 3 dias", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "weekly",
            interval: 1,
            days_of_week: [1, 3, 5],
            end_type: "never",
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(result.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR")
    })

    it("weekly com all weekdays ordenado", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "weekly",
            interval: 1,
            days_of_week: [5, 1, 3, 0, 6, 2, 4],
            end_type: "never",
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(result.rrule).toBe("FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA")
    })

    it("monthly", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "monthly",
            interval: 1,
            end_type: "never",
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(result.rrule).toBe("FREQ=MONTHLY")
    })

    it("end_type='date' adiciona UNTIL", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "weekly",
            interval: 1,
            days_of_week: [2],
            end_type: "date",
            end_date: "2026-12-31",
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(result.rrule).toBe("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T235959Z")
    })

    it("end_type='count' adiciona COUNT", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "daily",
            interval: 1,
            end_type: "count",
            end_count: 10,
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(result.rrule).toBe("FREQ=DAILY;COUNT=10")
    })

    it("output passa pelo validateV2", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "weekly",
            interval: 2,
            days_of_week: [1, 5],
            end_type: "count",
            end_count: 5,
        })
        // Validação completa do payload v2 + parse rrule
        expect(() => validateV2(result)).not.toThrow()
    })

    it("rrule resultante é parseável pelo lib", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "weekly",
            interval: 1,
            days_of_week: [1, 3, 5],
            end_type: "never",
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(() => RRule.fromString(result.rrule)).not.toThrow()
    })

    it("deduplica days_of_week com duplicatas", () => {
        const result = legacyConfigToV2Rrule({
            frequency: "weekly",
            interval: 1,
            days_of_week: [1, 1, 3, 1, 3],
            end_type: "never",
        })
        if (result.type !== "custom") throw new Error("esperava custom")
        expect(result.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE")
    })
})
