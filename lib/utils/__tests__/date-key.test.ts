import { describe, it, expect } from "vitest"
import {
    addDays,
    dayOfWeekFromDateKey,
    daysBetween,
    endOfMonth,
    endOfWeekSaturday,
    isValidDateKey,
    startOfMonth,
    startOfWeekSunday,
} from "@/lib/utils/date-key"

/**
 * Sprint 96 — aritmética de dia civil.
 *
 * Calendário de referência (verificado): agosto/2026 começa num sábado.
 *   Dom 09 · Seg 10 · Ter 11 · Qua 12 · Qui 13 · Sex 14 · Sáb 15
 */

describe("addDays — contrato herdado de s94", () => {
    it("soma e subtrai dias", () => {
        expect(addDays("2026-08-11", 1)).toBe("2026-08-12")
        expect(addDays("2026-08-11", -1)).toBe("2026-08-10")
        expect(addDays("2026-08-11", 0)).toBe("2026-08-11")
    })

    it("atravessa virada de mês e de ano", () => {
        expect(addDays("2026-08-31", 1)).toBe("2026-09-01")
        expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
        expect(addDays("2027-01-01", -1)).toBe("2026-12-31")
    })

    it("devolve dateKey malformado intacto, sem lançar", () => {
        expect(addDays("nao-e-data", 1)).toBe("nao-e-data")
        expect(addDays("", 1)).toBe("")
    })

    it("é DST-neutro: 18/10/2026 (virada de horário no hemisfério sul) não desloca o dia", () => {
        expect(addDays("2026-10-17", 1)).toBe("2026-10-18")
        expect(addDays("2026-10-18", 1)).toBe("2026-10-19")
    })
})

describe("isValidDateKey", () => {
    it("aceita datas reais", () => {
        expect(isValidDateKey("2026-08-11")).toBe(true)
        expect(isValidDateKey("2028-02-29")).toBe(true) // bissexto
    })

    it("rejeita datas inexistentes e formatos errados", () => {
        expect(isValidDateKey("2026-02-30")).toBe(false)
        expect(isValidDateKey("2026-02-29")).toBe(false) // 2026 não é bissexto
        expect(isValidDateKey("2026-13-01")).toBe(false)
        expect(isValidDateKey("11/08/2026")).toBe(false)
        expect(isValidDateKey(null)).toBe(false)
        expect(isValidDateKey(20260811)).toBe(false)
    })
})

describe("dayOfWeekFromDateKey", () => {
    it("0=domingo e 6=sábado", () => {
        expect(dayOfWeekFromDateKey("2026-08-09")).toBe(0) // domingo
        expect(dayOfWeekFromDateKey("2026-08-15")).toBe(6) // sábado
    })

    it("mapeia a semana inteira de referência", () => {
        const semana = [
            ["2026-08-09", 0],
            ["2026-08-10", 1],
            ["2026-08-11", 2],
            ["2026-08-12", 3],
            ["2026-08-13", 4],
            ["2026-08-14", 5],
            ["2026-08-15", 6],
        ] as const
        for (const [key, dow] of semana) {
            expect(dayOfWeekFromDateKey(key)).toBe(dow)
        }
    })

    it("é DST-neutro na virada do horário de verão", () => {
        // 18/10 é domingo; o dia da semana não pode escorregar por causa do relógio.
        expect(dayOfWeekFromDateKey("2026-10-18")).toBe(0)
    })

    it("retorna null para dateKey inválido", () => {
        expect(dayOfWeekFromDateKey("nao-e-data")).toBeNull()
    })
})

describe("startOfWeekSunday / endOfWeekSaturday", () => {
    it("resolve domingo→sábado a partir de um dia no meio da semana", () => {
        expect(startOfWeekSunday("2026-08-12")).toBe("2026-08-09")
        expect(endOfWeekSaturday("2026-08-12")).toBe("2026-08-15")
    })

    it("quando o dia JÁ é domingo, start é o próprio dia", () => {
        expect(startOfWeekSunday("2026-08-09")).toBe("2026-08-09")
        expect(endOfWeekSaturday("2026-08-09")).toBe("2026-08-15")
    })

    it("quando o dia JÁ é sábado, end é o próprio dia", () => {
        expect(startOfWeekSunday("2026-08-15")).toBe("2026-08-09")
        expect(endOfWeekSaturday("2026-08-15")).toBe("2026-08-15")
    })

    it("a janela tem sempre 7 dias", () => {
        for (let i = 0; i < 7; i++) {
            const dia = addDays("2026-08-09", i)
            expect(daysBetween(startOfWeekSunday(dia), endOfWeekSaturday(dia))).toBe(6)
        }
    })

    it("semana que cruza virada de mês", () => {
        // 30/08/2026 é domingo → 05/09/2026 é sábado
        expect(startOfWeekSunday("2026-09-02")).toBe("2026-08-30")
        expect(endOfWeekSaturday("2026-08-30")).toBe("2026-09-05")
    })

    it("semana que cruza virada de ano", () => {
        // 27/12/2026 é domingo → 02/01/2027 é sábado
        expect(startOfWeekSunday("2026-12-31")).toBe("2026-12-27")
        expect(endOfWeekSaturday("2026-12-31")).toBe("2027-01-02")
    })
})

describe("startOfMonth / endOfMonth", () => {
    it("delimita o mês civil completo", () => {
        expect(startOfMonth("2026-08-20")).toBe("2026-08-01")
        expect(endOfMonth("2026-08-20")).toBe("2026-08-31")
    })

    it("fevereiro de ano bissexto termina em 29", () => {
        expect(endOfMonth("2028-02-10")).toBe("2028-02-29")
    })

    it("fevereiro de ano não bissexto termina em 28", () => {
        expect(endOfMonth("2026-02-10")).toBe("2026-02-28")
    })

    it("meses de 30 dias", () => {
        expect(endOfMonth("2026-04-15")).toBe("2026-04-30")
        expect(endOfMonth("2026-09-01")).toBe("2026-09-30")
    })

    it("dezembro não vaza para janeiro", () => {
        expect(startOfMonth("2026-12-31")).toBe("2026-12-01")
        expect(endOfMonth("2026-12-01")).toBe("2026-12-31")
    })

    it("preserva o zero-padding do mês", () => {
        expect(startOfMonth("2026-01-15")).toBe("2026-01-01")
        expect(endOfMonth("2026-01-15")).toBe("2026-01-31")
    })
})

describe("daysBetween", () => {
    it("conta a distância com sinal", () => {
        expect(daysBetween("2026-08-11", "2026-08-14")).toBe(3)
        expect(daysBetween("2026-08-14", "2026-08-11")).toBe(-3)
        expect(daysBetween("2026-08-11", "2026-08-11")).toBe(0)
    })

    it("atravessa virada de ano", () => {
        expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1)
    })

    it("é DST-neutro (não devolve 0.96 nem 1.04 arredondado errado)", () => {
        expect(daysBetween("2026-10-17", "2026-10-18")).toBe(1)
    })

    it("NaN para entrada inválida", () => {
        expect(daysBetween("nao-e-data", "2026-08-11")).toBeNaN()
    })
})
