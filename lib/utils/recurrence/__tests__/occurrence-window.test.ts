import { describe, it, expect } from "vitest"
import {
    buildOccurrenceWindow,
    dateFilter,
    describeOccurrenceWindow,
    filterDateKey,
    isSpecificDayFilter,
    normalizeOccurrenceFilter,
    type OccurrenceFilter,
} from "@/lib/utils/recurrence/occurrence-window"

/**
 * Sprint 96. Calendário de referência (verificado):
 *   agosto/2026 — Dom 09 · Seg 10 · Ter 11 · Qua 12 · Qui 13 · Sex 14 · Sáb 15
 *
 * `todayKey` é sempre INJETADO — nenhum teste depende do relógio do processo,
 * o que é justamente o contrato que o módulo promete.
 */

const TER = "2026-08-11" // terça-feira
const SEX = "2026-08-14" // sexta-feira
const DOM = "2026-08-09" // domingo
const SAB = "2026-08-15" // sábado

describe("normalizeOccurrenceFilter", () => {
    it("aceita todos os filtros simples", () => {
        const validos = [
            "today", "tomorrow", "week", "month",
            "dow-0", "dow-1", "dow-2", "dow-3", "dow-4", "dow-5", "dow-6",
        ]
        for (const v of validos) expect(normalizeOccurrenceFilter(v)).toBe(v)
    })

    it("aceita data específica válida", () => {
        expect(normalizeOccurrenceFilter("date:2026-08-15")).toBe("date:2026-08-15")
    })

    it("rejeita valor desconhecido vindo da URL", () => {
        expect(normalizeOccurrenceFilter("amanha")).toBe("")
        expect(normalizeOccurrenceFilter("TODAY")).toBe("")
        expect(normalizeOccurrenceFilter("dow-7")).toBe("")
        expect(normalizeOccurrenceFilter("dow--1")).toBe("")
        expect(normalizeOccurrenceFilter("dow-")).toBe("")
    })

    it("rejeita null, undefined e string vazia", () => {
        expect(normalizeOccurrenceFilter(null)).toBe("")
        expect(normalizeOccurrenceFilter(undefined)).toBe("")
        expect(normalizeOccurrenceFilter("")).toBe("")
    })

    it("rejeita data malformada ou inexistente", () => {
        expect(normalizeOccurrenceFilter("date:2026-02-30")).toBe("")
        expect(normalizeOccurrenceFilter("date:14/08/2026")).toBe("")
        expect(normalizeOccurrenceFilter("date:")).toBe("")
    })
})

describe("dateFilter / filterDateKey", () => {
    it("faz roundtrip de uma data válida", () => {
        const f = dateFilter("2026-08-15")
        expect(f).toBe("date:2026-08-15")
        expect(filterDateKey(f)).toBe("2026-08-15")
    })

    it("dateFilter rejeita data inválida", () => {
        expect(dateFilter("2026-02-30")).toBe("")
    })

    it("filterDateKey retorna null para filtros que não são de data", () => {
        expect(filterDateKey("today")).toBeNull()
        expect(filterDateKey("week")).toBeNull()
        expect(filterDateKey("")).toBeNull()
    })
})

// s96 — os chips de dia da semana sairam da barra por decisao de design (7 dos 13
// controles, e o unico elemento que precisava de legenda para ser entendido).
// A REGRA continua valendo: `?when=dow-N` em link salvo ou compartilhado nao pode
// quebrar. Estes testes travam esse contrato.
describe("compatibilidade: dow-N segue valido por URL apos sair da UI", () => {
    it("normalizeOccurrenceFilter continua aceitando os sete dias", () => {
        for (let d = 0; d <= 6; d++) {
            expect(normalizeOccurrenceFilter(`dow-${d}`)).toBe(`dow-${d}`)
        }
    })

    it("buildOccurrenceWindow continua resolvendo dow-N", () => {
        expect(buildOccurrenceWindow("dow-5", TER)).toEqual({ startKey: SEX, endKey: SEX })
    })

    it("describeOccurrenceWindow continua rotulando dow-N", () => {
        const w = buildOccurrenceWindow("dow-5", TER)!
        expect(describeOccurrenceWindow("dow-5", w)).toBe("Rotinas de sexta-feira, 14 de agosto")
    })
})

const TODOS_OS_DOW = [
    "dow-0", "dow-1", "dow-2", "dow-3", "dow-4", "dow-5", "dow-6",
] as const satisfies readonly OccurrenceFilter[]

describe("isSpecificDayFilter", () => {
    it("é verdadeiro para data do calendário e para dia da semana legado", () => {
        expect(isSpecificDayFilter("date:2026-08-20")).toBe(true)
        for (const f of TODOS_OS_DOW) {
            expect(isSpecificDayFilter(f)).toBe(true)
        }
    })

    it("é falso para os períodos e para o estado sem filtro", () => {
        for (const f of ["", "today", "tomorrow", "week", "month"] as OccurrenceFilter[]) {
            expect(isSpecificDayFilter(f)).toBe(false)
        }
    })

    it("todo filtro específico produz janela de UM dia — o que a UI assume", () => {
        for (const f of ["date:2026-08-20", "dow-0", "dow-3", "dow-6"] as OccurrenceFilter[]) {
            const w = buildOccurrenceWindow(f, TER)
            expect(w).not.toBeNull()
            expect(w!.startKey).toBe(w!.endKey)
        }
    })
})

describe("buildOccurrenceWindow", () => {
    it("filtro vazio não produz janela", () => {
        expect(buildOccurrenceWindow("", TER)).toBeNull()
    })

    it("todayKey inválido não produz janela", () => {
        expect(buildOccurrenceWindow("today", "nao-e-data")).toBeNull()
    })

    it("'today' é janela de 1 dia igual a hoje", () => {
        expect(buildOccurrenceWindow("today", TER)).toEqual({ startKey: TER, endKey: TER })
    })

    it("'tomorrow' é o dia seguinte", () => {
        expect(buildOccurrenceWindow("tomorrow", TER)).toEqual({
            startKey: "2026-08-12",
            endKey: "2026-08-12",
        })
    })

    it("'tomorrow' atravessa virada de mês", () => {
        expect(buildOccurrenceWindow("tomorrow", "2026-08-31")).toEqual({
            startKey: "2026-09-01",
            endKey: "2026-09-01",
        })
    })

    it("'tomorrow' atravessa virada de ano", () => {
        expect(buildOccurrenceWindow("tomorrow", "2026-12-31")).toEqual({
            startKey: "2027-01-01",
            endKey: "2027-01-01",
        })
    })

    describe("chips de dia da semana (forward-only)", () => {
        it("o dia de hoje resolve para hoje, não para a semana seguinte", () => {
            // Terça = dow 2
            expect(buildOccurrenceWindow("dow-2", TER)).toEqual({ startKey: TER, endKey: TER })
        })

        it("um dia à frente na mesma semana", () => {
            // Terça 11 → sexta 14
            expect(buildOccurrenceWindow("dow-5", TER)).toEqual({ startKey: SEX, endKey: SEX })
        })

        it("um dia já passado salta para a semana seguinte", () => {
            // Sexta 14 + "segunda" → segunda 17 (não a 10, que já passou)
            expect(buildOccurrenceWindow("dow-1", SEX)).toEqual({
                startKey: "2026-08-17",
                endKey: "2026-08-17",
            })
        })

        it("no sábado, domingo é o dia seguinte", () => {
            expect(buildOccurrenceWindow("dow-0", SAB)).toEqual({
                startKey: "2026-08-16",
                endKey: "2026-08-16",
            })
        })

        it("nunca resolve para o passado, a partir de qualquer dia da semana", () => {
            for (let offset = 0; offset < 7; offset++) {
                const hoje = ["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12",
                    "2026-08-13", "2026-08-14", "2026-08-15"][offset]
                for (let target = 0; target < 6 + 1; target++) {
                    const w = buildOccurrenceWindow(`dow-${target}` as OccurrenceFilter, hoje)
                    expect(w).not.toBeNull()
                    expect(w!.startKey >= hoje).toBe(true)
                }
            }
        })

        it("atravessa virada de mês", () => {
            // Segunda 31/08 + "quarta" → 02/09
            expect(buildOccurrenceWindow("dow-3", "2026-08-31")).toEqual({
                startKey: "2026-09-02",
                endKey: "2026-09-02",
            })
        })
    })

    describe("'week' — semana civil domingo → sábado", () => {
        it("a partir de um dia no meio da semana", () => {
            expect(buildOccurrenceWindow("week", TER)).toEqual({ startKey: DOM, endKey: SAB })
        })

        it("é o MESMO intervalo para qualquer dia da semana (inclui dias passados)", () => {
            for (const dia of [DOM, "2026-08-10", TER, "2026-08-12", "2026-08-13", SEX, SAB]) {
                expect(buildOccurrenceWindow("week", dia)).toEqual({ startKey: DOM, endKey: SAB })
            }
        })

        it("cruza virada de mês", () => {
            // 02/09/2026 é quarta; a semana começa em 30/08 e termina em 05/09
            expect(buildOccurrenceWindow("week", "2026-09-02")).toEqual({
                startKey: "2026-08-30",
                endKey: "2026-09-05",
            })
        })

        it("cruza virada de ano", () => {
            expect(buildOccurrenceWindow("week", "2026-12-31")).toEqual({
                startKey: "2026-12-27",
                endKey: "2027-01-02",
            })
        })
    })

    describe("'month' — mês civil completo", () => {
        it("vai do dia 1 ao último dia, incluindo dias já passados", () => {
            expect(buildOccurrenceWindow("month", "2026-08-20")).toEqual({
                startKey: "2026-08-01",
                endKey: "2026-08-31",
            })
        })

        it("fevereiro de ano bissexto termina em 29", () => {
            expect(buildOccurrenceWindow("month", "2028-02-10")).toEqual({
                startKey: "2028-02-01",
                endKey: "2028-02-29",
            })
        })

        it("fevereiro de ano não bissexto termina em 28", () => {
            expect(buildOccurrenceWindow("month", "2026-02-10")).toEqual({
                startKey: "2026-02-01",
                endKey: "2026-02-28",
            })
        })

        it("dezembro não vaza para janeiro", () => {
            expect(buildOccurrenceWindow("month", "2026-12-31")).toEqual({
                startKey: "2026-12-01",
                endKey: "2026-12-31",
            })
        })
    })

    describe("'date:' — data específica do calendário", () => {
        it("aceita data futura", () => {
            expect(buildOccurrenceWindow("date:2026-12-25", TER)).toEqual({
                startKey: "2026-12-25",
                endKey: "2026-12-25",
            })
        })

        it("aceita data PASSADA (é o caminho para olhar dias que já ocorreram)", () => {
            expect(buildOccurrenceWindow("date:2026-01-05", TER)).toEqual({
                startKey: "2026-01-05",
                endKey: "2026-01-05",
            })
        })

        it("data inválida não produz janela", () => {
            expect(buildOccurrenceWindow("date:2026-02-30" as OccurrenceFilter, TER)).toBeNull()
        })
    })
})

describe("describeOccurrenceWindow", () => {
    const label = (f: OccurrenceFilter, hoje: string) => {
        const w = buildOccurrenceWindow(f, hoje)
        return w ? describeOccurrenceWindow(f, w) : null
    }

    it("'hoje' traz o dia da semana e a data por extenso", () => {
        expect(label("today", TER)).toBe("Rotinas de hoje — terça-feira, 11 de agosto")
    })

    it("'amanhã' idem", () => {
        expect(label("tomorrow", TER)).toBe("Rotinas de amanhã — quarta-feira, 12 de agosto")
    })

    it("chip de dia da semana mostra a data RESOLVIDA (remove a ambiguidade)", () => {
        expect(label("dow-1", SEX)).toBe("Rotinas de segunda-feira, 17 de agosto")
    })

    it("'esta semana' descreve o intervalo", () => {
        expect(label("week", TER)).toBe("Rotinas desta semana — 9 a 15 de agosto")
    })

    it("'esta semana' cruzando meses nomeia os dois meses", () => {
        expect(label("week", "2026-09-02")).toBe(
            "Rotinas desta semana — 30 de agosto a 5 de setembro",
        )
    })

    it("'este mês' nomeia mês e ano", () => {
        expect(label("month", TER)).toBe("Rotinas de agosto de 2026")
    })

    it("data específica traz dia da semana e data", () => {
        expect(label("date:2026-12-25", TER)).toBe("Rotinas de sexta-feira, 25 de dezembro")
    })
})
