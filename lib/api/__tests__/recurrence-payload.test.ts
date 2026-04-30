import { describe, it, expect } from "vitest"
import { processRecurrencePayload } from "../recurrence-payload"

describe("processRecurrencePayload — detecção estrita de v2", () => {
    it("retorna mode='v1' para undefined", () => {
        expect(processRecurrencePayload(undefined)).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para null", () => {
        expect(processRecurrencePayload(null)).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para objeto vazio", () => {
        expect(processRecurrencePayload({})).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para config v1 legado", () => {
        const v1 = {
            frequency: "weekly",
            interval: 1,
            days_of_week: [1, 3],
            end_type: "never",
        }
        expect(processRecurrencePayload(v1)).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para version=1", () => {
        expect(
            processRecurrencePayload({ version: 1, type: "daily" }),
        ).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para version='2' string (NÃO coerce)", () => {
        expect(
            processRecurrencePayload({ version: "2", type: "daily" }),
        ).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para version=3 (futuro)", () => {
        expect(
            processRecurrencePayload({ version: 3, type: "daily" }),
        ).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para array (não objeto plain)", () => {
        expect(processRecurrencePayload([])).toEqual({ mode: "v1" })
    })

    it("retorna mode='v1' para string", () => {
        expect(processRecurrencePayload("daily")).toEqual({ mode: "v1" })
    })
})

describe("processRecurrencePayload — v2 válido", () => {
    it("aceita daily v2", () => {
        const result = processRecurrencePayload({ version: 2, type: "daily" })
        expect(result).toEqual({
            mode: "v2",
            ok: true,
            validated: { version: 2, type: "daily" },
        })
    })

    it("aceita weekly v2 e devolve validated", () => {
        const result = processRecurrencePayload({
            version: 2,
            type: "weekly",
            weekdays: [1, 3, 5],
        })
        expect(result).toEqual({
            mode: "v2",
            ok: true,
            validated: { version: 2, type: "weekly", weekdays: [1, 3, 5] },
        })
    })

    it("aceita monthly day_of_month v2", () => {
        const result = processRecurrencePayload({
            version: 2,
            type: "monthly",
            mode: "day_of_month",
            day: 15,
        })
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && result.ok) {
            expect(result.validated).toEqual({
                version: 2,
                type: "monthly",
                mode: "day_of_month",
                day: 15,
            })
        }
    })
})

describe("processRecurrencePayload — v2 inválido", () => {
    it("rejeita weekly sem weekdays (F.4)", () => {
        const result = processRecurrencePayload({
            version: 2,
            type: "weekly",
        })
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && !result.ok) {
            expect(result.error).toBeTruthy()
        } else {
            throw new Error("esperava v2 inválido")
        }
    })

    it("rejeita weekly com weekdays vazio (F.4)", () => {
        const result = processRecurrencePayload({
            version: 2,
            type: "weekly",
            weekdays: [],
        })
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && !result.ok) {
            expect(result.error).toMatch(/não pode ser vazio/)
        } else {
            throw new Error("esperava v2 inválido")
        }
    })

    it("rejeita type desconhecido", () => {
        const result = processRecurrencePayload({
            version: 2,
            type: "biweekly",
        })
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && !result.ok) {
            expect(result.error).toBeTruthy()
        }
    })

    it("rejeita monthly day_of_month com day=0", () => {
        const result = processRecurrencePayload({
            version: 2,
            type: "monthly",
            mode: "day_of_month",
            day: 0,
        })
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && !result.ok) {
            expect(result.error).toBeTruthy()
        }
    })

    it("rejeita custom com rrule vazia", () => {
        const result = processRecurrencePayload({
            version: 2,
            type: "custom",
            rrule: "",
        })
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && !result.ok) {
            expect(result.error).toBeTruthy()
        }
    })
})

describe("processRecurrencePayload — imutabilidade", () => {
    it("não muta input v1 (passagem em v1 é literal)", () => {
        const input = {
            frequency: "weekly",
            interval: 1,
            days_of_week: [1, 3],
            end_type: "never",
        }
        const snapshot = JSON.stringify(input)
        processRecurrencePayload(input)
        expect(JSON.stringify(input)).toBe(snapshot)
    })

    it("não muta input v2 — devolve novo objeto", () => {
        const input = { version: 2, type: "weekly", weekdays: [3, 1, 5] }
        const snapshot = JSON.stringify(input)
        const result = processRecurrencePayload(input)
        // Input intacto
        expect(JSON.stringify(input)).toBe(snapshot)
        // Saída é objeto novo (não a mesma referência)
        if (result.mode === "v2" && result.ok) {
            expect(result.validated).not.toBe(input)
        }
    })

    it("não muta input v2 inválido", () => {
        const input = { version: 2, type: "weekly", weekdays: [] }
        const snapshot = JSON.stringify(input)
        processRecurrencePayload(input)
        expect(JSON.stringify(input)).toBe(snapshot)
    })
})
