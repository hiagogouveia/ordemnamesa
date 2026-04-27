import { describe, it, expect } from "vitest"
import {
    findWeekdayPositionInMonth,
    parseDateKey,
    daysInMonth,
} from "../weekday-position"

const SUN = 0
const MON = 1
const TUE = 2
const WED = 3
const THU = 4
const FRI = 5
const SAT = 6

describe("findWeekdayPositionInMonth", () => {
    describe("ocorrências normais", () => {
        it("primeira segunda de abril/2026 = 6 (1º abril/2026 é quarta)", () => {
            expect(findWeekdayPositionInMonth(2026, 4, MON, 1)).toBe(6)
        })

        it("segunda segunda de abril/2026 = 13", () => {
            expect(findWeekdayPositionInMonth(2026, 4, MON, 2)).toBe(13)
        })

        it("terceira segunda de abril/2026 = 20", () => {
            expect(findWeekdayPositionInMonth(2026, 4, MON, 3)).toBe(20)
        })

        it("quarta segunda de abril/2026 = 27", () => {
            expect(findWeekdayPositionInMonth(2026, 4, MON, 4)).toBe(27)
        })
    })

    describe("última ocorrência (-1)", () => {
        it("última segunda de abril/2026 = 27 (mês com 4 segundas)", () => {
            expect(findWeekdayPositionInMonth(2026, 4, MON, -1)).toBe(27)
        })

        it("última quinta de abril/2026 = 30 (mês com 5 quintas)", () => {
            expect(findWeekdayPositionInMonth(2026, 4, THU, -1)).toBe(30)
        })

        it("última sexta de fevereiro/2026 = 27", () => {
            expect(findWeekdayPositionInMonth(2026, 2, FRI, -1)).toBe(27)
        })

        it("última quarta de janeiro/2027 = 27", () => {
            expect(findWeekdayPositionInMonth(2027, 1, WED, -1)).toBe(27)
        })
    })

    describe("posição inexistente retorna null", () => {
        it("4ª quinta-feira de fevereiro/2026 (só tem 4) → 26", () => {
            // fev/2026: quintas em 5, 12, 19, 26 → 4ª existe = 26
            expect(findWeekdayPositionInMonth(2026, 2, THU, 4)).toBe(26)
        })

        it("4ª quarta-feira de fevereiro/2026 (só tem 4) → 25", () => {
            // fev/2026: quartas em 4, 11, 18, 25
            expect(findWeekdayPositionInMonth(2026, 2, WED, 4)).toBe(25)
        })

        it("simulação de 5ª segunda em abril/2026 — função aceita só até 4", () => {
            // weekOfMonth válido é 1|2|3|4|-1; 5 não é tipo válido em runtime
            // mas se passar por algum caminho, deve retornar null
            expect(
                findWeekdayPositionInMonth(2026, 4, MON, 5 as unknown as 1)
            ).toBeNull()
        })

        it("posição 0 inválida retorna null", () => {
            expect(
                findWeekdayPositionInMonth(2026, 4, MON, 0 as unknown as 1)
            ).toBeNull()
        })
    })

    describe("validações de entrada", () => {
        it("mês 0 retorna null", () => {
            expect(findWeekdayPositionInMonth(2026, 0, MON, 1)).toBeNull()
        })

        it("mês 13 retorna null", () => {
            expect(findWeekdayPositionInMonth(2026, 13, MON, 1)).toBeNull()
        })

        it("weekday 7 retorna null", () => {
            expect(findWeekdayPositionInMonth(2026, 4, 7, 1)).toBeNull()
        })

        it("weekday -1 retorna null", () => {
            expect(findWeekdayPositionInMonth(2026, 4, -1, 1)).toBeNull()
        })

        it("year não inteiro retorna null", () => {
            expect(findWeekdayPositionInMonth(2026.5, 4, MON, 1)).toBeNull()
        })
    })

    describe("ano bissexto", () => {
        it("última quarta de fev/2024 (bissexto) = 28", () => {
            // fev/2024: quartas em 7, 14, 21, 28
            expect(findWeekdayPositionInMonth(2024, 2, WED, -1)).toBe(28)
        })

        it("última quinta de fev/2024 (bissexto) = 29", () => {
            expect(findWeekdayPositionInMonth(2024, 2, THU, -1)).toBe(29)
        })
    })

    describe("todos os dias da semana", () => {
        it("primeiro domingo de abril/2026 = 5", () => {
            expect(findWeekdayPositionInMonth(2026, 4, SUN, 1)).toBe(5)
        })

        it("primeiro sábado de abril/2026 = 4", () => {
            expect(findWeekdayPositionInMonth(2026, 4, SAT, 1)).toBe(4)
        })

        it("primeira terça de abril/2026 = 7", () => {
            expect(findWeekdayPositionInMonth(2026, 4, TUE, 1)).toBe(7)
        })
    })
})

describe("parseDateKey", () => {
    it("parseia data válida", () => {
        expect(parseDateKey("2026-04-27")).toEqual({ year: 2026, month: 4, day: 27 })
    })

    it("parseia 2024-02-29 (bissexto)", () => {
        expect(parseDateKey("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 })
    })

    it("rejeita formato inválido", () => {
        expect(parseDateKey("27/04/2026")).toBeNull()
        expect(parseDateKey("2026-4-27")).toBeNull()
        expect(parseDateKey("2026-04-27T00:00:00")).toBeNull()
        expect(parseDateKey("")).toBeNull()
    })

    it("rejeita mês inválido", () => {
        expect(parseDateKey("2026-13-01")).toBeNull()
        expect(parseDateKey("2026-00-01")).toBeNull()
    })

    it("rejeita dia inválido", () => {
        expect(parseDateKey("2026-04-32")).toBeNull()
        expect(parseDateKey("2026-04-00")).toBeNull()
    })
})

describe("daysInMonth", () => {
    it("janeiro tem 31", () => {
        expect(daysInMonth(2026, 1)).toBe(31)
    })

    it("abril tem 30", () => {
        expect(daysInMonth(2026, 4)).toBe(30)
    })

    it("fevereiro/2026 tem 28 (não bissexto)", () => {
        expect(daysInMonth(2026, 2)).toBe(28)
    })

    it("fevereiro/2024 tem 29 (bissexto)", () => {
        expect(daysInMonth(2024, 2)).toBe(29)
    })

    it("fevereiro/2000 tem 29 (bissexto secular)", () => {
        expect(daysInMonth(2000, 2)).toBe(29)
    })

    it("fevereiro/1900 tem 28 (não bissexto secular)", () => {
        expect(daysInMonth(1900, 2)).toBe(28)
    })
})
