import { describe, it, expect, vi, afterEach } from "vitest"
import { RRule } from "rrule"
import type { RecurrenceV2 } from "@/lib/types"
import {
    occursInRange,
    occursOnDate,
    type ChecklistForOccurrence,
} from "@/lib/utils/recurrence/occurrence"
import { shouldChecklistAppearToday } from "@/lib/utils/should-checklist-appear-today"
import type { ShiftForRecurrence } from "@/lib/utils/recurrence/evaluate"

/**
 * Sprint 96. Calendário de referência (verificado):
 *   agosto/2026 — Dom 09 · Seg 10 · Ter 11 · Qua 12 · Qui 13 · Sex 14 · Sáb 15
 *   Semana civil de referência: 2026-08-09 → 2026-08-15
 *   Mês de referência:          2026-08-01 → 2026-08-31
 */

const DOM = "2026-08-09"
const SEG = "2026-08-10"
const TER = "2026-08-11"
const SEX = "2026-08-14"
const SAB = "2026-08-15"

const SEMANA = { start: DOM, end: SAB }
const MES = { start: "2026-08-01", end: "2026-08-31" }

const v2 = (config: RecurrenceV2): ChecklistForOccurrence => ({
    recurrence: config.type,
    recurrence_config: config,
})

afterEach(() => vi.restoreAllMocks())

describe("occursOnDate", () => {
    it("é idêntico a shouldChecklistAppearToday para o mesmo dia", () => {
        const c = v2({ version: 2, type: "weekly", weekdays: [2] })
        // terça = dow 2
        expect(occursOnDate(c, TER)).toBe(shouldChecklistAppearToday(c, 2, TER))
        expect(occursOnDate(c, SEG)).toBe(shouldChecklistAppearToday(c, 1, SEG))
    })

    it("deriva o dia da semana da PRÓPRIA data (não aceita divergência)", () => {
        const c = v2({ version: 2, type: "weekly", weekdays: [5] }) // sexta
        expect(occursOnDate(c, SEX)).toBe(true)
        expect(occursOnDate(c, SEG)).toBe(false)
    })

    it("dateKey inválido é falso, não lança", () => {
        expect(occursOnDate(v2({ version: 2, type: "daily" }), "nao-e-data")).toBe(false)
    })
})

describe("occursInRange — recorrência v2", () => {
    it("diária ocorre em qualquer janela, inclusive de 1 dia", () => {
        const c = v2({ version: 2, type: "daily" })
        expect(occursInRange(c, TER, TER)).toBe(true)
        expect(occursInRange(c, SEMANA.start, SEMANA.end)).toBe(true)
        expect(occursInRange(c, MES.start, MES.end)).toBe(true)
    })

    it("semanal [seg, qua, sex] ocorre na semana e só nos dias configurados", () => {
        const c = v2({ version: 2, type: "weekly", weekdays: [1, 3, 5] })
        expect(occursInRange(c, SEMANA.start, SEMANA.end)).toBe(true)
        expect(occursInRange(c, SEG, SEG)).toBe(true)
        expect(occursInRange(c, SEX, SEX)).toBe(true)
        expect(occursInRange(c, TER, TER)).toBe(false)
        expect(occursInRange(c, SAB, SAB)).toBe(false)
        expect(occursInRange(c, DOM, DOM)).toBe(false)
    })

    it("semanal sem dias nunca ocorre (v2 é fail-closed)", () => {
        const c = v2({ version: 2, type: "weekly", weekdays: [] })
        expect(occursInRange(c, SEMANA.start, SEMANA.end)).toBe(false)
        expect(occursInRange(c, MES.start, MES.end)).toBe(false)
    })

    it("múltiplas ocorrências na mesma semana são detectadas em janela parcial", () => {
        const c = v2({ version: 2, type: "weekly", weekdays: [1, 3, 5] })
        // Terça → quinta contém apenas a quarta
        expect(occursInRange(c, TER, "2026-08-13")).toBe(true)
        // Sábado → domingo seguinte não contém nenhum
        expect(occursInRange(c, SAB, "2026-08-16")).toBe(false)
    })

    describe("shift_days", () => {
        const shifts: ShiftForRecurrence[] = [
            { id: "s1", shift_type: "morning", days_of_week: [1, 2, 3] },
            { id: "s2", shift_type: "evening", days_of_week: [5, 6] },
        ]

        it("respeita a UNIÃO dos days_of_week dos turnos N:N", () => {
            const c: ChecklistForOccurrence = {
                ...v2({ version: 2, type: "shift_days" }),
                shift_ids: ["s1", "s2"],
            }
            expect(occursInRange(c, SEG, SEG, shifts)).toBe(true) // dow 1 (s1)
            expect(occursInRange(c, SEX, SEX, shifts)).toBe(true) // dow 5 (s2)
            expect(occursInRange(c, "2026-08-13", "2026-08-13", shifts)).toBe(false) // dow 4
            expect(occursInRange(c, DOM, DOM, shifts)).toBe(false) // dow 0
        })

        it("um único turno restringe aos dias dele", () => {
            const c: ChecklistForOccurrence = {
                ...v2({ version: 2, type: "shift_days" }),
                shift_ids: ["s2"],
            }
            expect(occursInRange(c, SEX, SEX, shifts)).toBe(true)
            expect(occursInRange(c, SEG, SEG, shifts)).toBe(false)
        })

        it("sem shifts carregados é fail-open (caso da visão global)", () => {
            const c: ChecklistForOccurrence = {
                ...v2({ version: 2, type: "shift_days" }),
                shift_ids: ["s1"],
            }
            expect(occursInRange(c, DOM, DOM, [])).toBe(true)
            expect(occursInRange(c, DOM, DOM, undefined)).toBe(true)
        })
    })

    describe("mensal", () => {
        it("day_of_month=15 ocorre no mês e não numa semana que não contém o 15", () => {
            const c = v2({ version: 2, type: "monthly", mode: "day_of_month", day: 15 })
            expect(occursInRange(c, MES.start, MES.end)).toBe(true)
            expect(occursInRange(c, "2026-08-15", "2026-08-15")).toBe(true)
            // Semana de 09 a 15 CONTÉM o dia 15
            expect(occursInRange(c, SEMANA.start, SEMANA.end)).toBe(true)
            // Semana anterior (02 a 08) não contém
            expect(occursInRange(c, "2026-08-02", "2026-08-08")).toBe(false)
        })

        it("'Este mês' mostra a rotina do dia 15 mesmo quando hoje já é dia 20", () => {
            // É o comportamento pedido: mês civil completo, incluindo dias passados.
            const c = v2({ version: 2, type: "monthly", mode: "day_of_month", day: 15 })
            expect(occursInRange(c, MES.start, MES.end)).toBe(true)
        })

        it("day_of_month=31 não ocorre em fevereiro (pula o mês)", () => {
            const c = v2({ version: 2, type: "monthly", mode: "day_of_month", day: 31 })
            expect(occursInRange(c, "2026-02-01", "2026-02-28")).toBe(false)
            expect(occursInRange(c, "2026-08-01", "2026-08-31")).toBe(true)
        })

        it("days_of_month com -1 casa o último dia de meses de 28, 29, 30 e 31 dias", () => {
            const c = v2({ version: 2, type: "monthly", mode: "days_of_month", days: [-1] })
            expect(occursOnDate(c, "2026-02-28")).toBe(true) // 28
            expect(occursOnDate(c, "2028-02-29")).toBe(true) // 29 (bissexto)
            expect(occursOnDate(c, "2026-04-30")).toBe(true) // 30
            expect(occursOnDate(c, "2026-08-31")).toBe(true) // 31
            expect(occursOnDate(c, "2026-08-30")).toBe(false)
        })

        it("weekday_position: 5ª segunda inexistente não ocorre no mês", () => {
            // Agosto/2026 tem segundas em 3, 10, 17, 24, 31 — a 4ª é dia 24.
            const quarta = v2({
                version: 2, type: "monthly", mode: "weekday_position",
                weekday: 1, weekOfMonth: 4,
            })
            expect(occursOnDate(quarta, "2026-08-24")).toBe(true)

            // Fevereiro/2026 tem 4 segundas — a "última" (-1) existe, mas a 4ª é a última.
            const ultima = v2({
                version: 2, type: "monthly", mode: "weekday_position",
                weekday: 1, weekOfMonth: -1,
            })
            expect(occursInRange(ultima, "2026-02-01", "2026-02-28")).toBe(true)
        })
    })

    describe("anual", () => {
        it("29/02 ocorre em ano bissexto e não em ano comum", () => {
            const c = v2({ version: 2, type: "yearly", mode: "date", day: 29, month: 2 })
            expect(occursInRange(c, "2028-01-01", "2028-12-31")).toBe(true)
            expect(occursInRange(c, "2026-02-01", "2026-02-28")).toBe(false)
        })

        it("só ocorre no mês configurado", () => {
            const c = v2({ version: 2, type: "yearly", mode: "date", day: 15, month: 8 })
            expect(occursInRange(c, MES.start, MES.end)).toBe(true)
            expect(occursInRange(c, "2026-09-01", "2026-09-30")).toBe(false)
        })

        it("mudança de ano: a mesma rotina ocorre no ano seguinte", () => {
            const c = v2({ version: 2, type: "yearly", mode: "date", day: 5, month: 1 })
            expect(occursOnDate(c, "2026-01-05")).toBe(true)
            expect(occursOnDate(c, "2027-01-05")).toBe(true)
            expect(occursOnDate(c, "2026-12-31")).toBe(false)
        })
    })
})

describe("occursInRange — custom (rrule)", () => {
    it("REGRESSÃO s96: rrule sem DTSTART casa uma segunda-feira JÁ PASSADA", () => {
        // Antes da correção, RRule.fromString ancorava o dtstart em new Date(),
        // então nenhuma data anterior ao parse casava — "Esta semana"/"Este mês"
        // nunca mostrariam rotinas personalizadas em dias passados.
        const c = v2({ version: 2, type: "custom", rrule: "FREQ=WEEKLY;BYDAY=MO" })
        expect(occursInRange(c, "2020-01-06", "2020-01-06")).toBe(true) // segunda de 2020
        expect(occursInRange(c, "2020-01-07", "2020-01-07")).toBe(false) // terça
    })

    it("REGRESSÃO s96: FREQ=DAILY sem DTSTART casa independentemente da hora do processo", () => {
        // O bug fazia rotinas custom sumirem de "Hoje" entre 21h e 24h em SP.
        const c = v2({ version: 2, type: "custom", rrule: "FREQ=DAILY" })
        for (const dia of [DOM, SEG, TER, SEX, SAB, "2019-03-14"]) {
            expect(occursInRange(c, dia, dia)).toBe(true)
        }
    })

    it("é determinístico: o mesmo range devolve o mesmo resultado em chamadas repetidas", () => {
        const c = v2({ version: 2, type: "custom", rrule: "FREQ=WEEKLY;BYDAY=WE" })
        const a = occursInRange(c, SEMANA.start, SEMANA.end)
        const b = occursInRange(c, SEMANA.start, SEMANA.end)
        expect(a).toBe(b)
        expect(a).toBe(true)
    })

    it("DTSTART explícito tem precedência e não casa janela anterior a ele", () => {
        const c = v2({
            version: 2,
            type: "custom",
            rrule: "DTSTART:20261201T000000Z\nRRULE:FREQ=DAILY",
        })
        expect(occursInRange(c, MES.start, MES.end)).toBe(false) // agosto
        expect(occursInRange(c, "2026-12-01", "2026-12-31")).toBe(true)
    })

    it("UNTIL no passado continua retornando false em janela posterior", () => {
        const c = v2({
            version: 2,
            type: "custom",
            rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY;UNTIL=20260301T235959Z",
        })
        expect(occursInRange(c, "2026-02-01", "2026-02-28")).toBe(true)
        expect(occursInRange(c, "2026-04-01", "2026-04-30")).toBe(false)
    })

    it("rrule inválida é fail-closed", () => {
        const c = v2({ version: 2, type: "custom", rrule: "FREQ=BANANA" })
        expect(occursInRange(c, SEMANA.start, SEMANA.end)).toBe(false)
        expect(occursOnDate(c, TER)).toBe(false)
    })

    it("uma janela de 31 dias faz UMA única chamada a between (não 31)", () => {
        const spy = vi.spyOn(RRule.prototype, "between")
        const c = v2({ version: 2, type: "custom", rrule: "FREQ=WEEKLY;BYDAY=SU" })
        occursInRange(c, MES.start, MES.end)
        expect(spy).toHaveBeenCalledTimes(1)
    })
})

describe("occursInRange — v1 legado", () => {
    it("recurrence='daily' ocorre sempre", () => {
        const c: ChecklistForOccurrence = { recurrence: "daily" }
        expect(occursInRange(c, TER, TER)).toBe(true)
    })

    it("recurrence='weekdays' cobre seg-sex e não sáb/dom", () => {
        const c: ChecklistForOccurrence = { recurrence: "weekdays" }
        expect(occursInRange(c, SEG, SEG)).toBe(true)
        expect(occursInRange(c, SEX, SEX)).toBe(true)
        expect(occursInRange(c, SAB, SAB)).toBe(false)
        expect(occursInRange(c, DOM, DOM)).toBe(false)
        expect(occursInRange(c, SAB, "2026-08-16")).toBe(false) // sáb + dom
    })

    it("recurrence='weekly' com days_of_week respeita os dias", () => {
        const c: ChecklistForOccurrence = {
            recurrence: "weekly",
            recurrence_config: {
                frequency: "weekly", interval: 1, end_type: "never", days_of_week: [2],
            },
        }
        expect(occursInRange(c, TER, TER)).toBe(true)
        expect(occursInRange(c, SEG, SEG)).toBe(false)
        expect(occursInRange(c, SEMANA.start, SEMANA.end)).toBe(true)
    })

    describe("fail-open documentados (decisão s96: manter intactos)", () => {
        it("v1 monthly aparece em TODAS as janelas", () => {
            const c: ChecklistForOccurrence = { recurrence: "monthly" }
            for (const [s, e] of [[TER, TER], [DOM, DOM], [SEMANA.start, SEMANA.end]]) {
                expect(occursInRange(c, s, e)).toBe(true)
            }
        })

        it("v1 yearly aparece em TODAS as janelas", () => {
            const c: ChecklistForOccurrence = { recurrence: "yearly" }
            expect(occursInRange(c, TER, TER)).toBe(true)
            expect(occursInRange(c, MES.start, MES.end)).toBe(true)
        })

        it("v1 weekly SEM days_of_week aparece todo dia", () => {
            const c: ChecklistForOccurrence = { recurrence: "weekly" }
            expect(occursInRange(c, TER, TER)).toBe(true)
            expect(occursInRange(c, SAB, SAB)).toBe(true)
        })

        it("recurrence null aparece todo dia", () => {
            const c: ChecklistForOccurrence = { recurrence: null }
            expect(occursInRange(c, TER, TER)).toBe(true)
        })

        it("recurrence desconhecida aparece todo dia", () => {
            const c: ChecklistForOccurrence = { recurrence: "quinzenal" }
            expect(occursInRange(c, TER, TER)).toBe(true)
        })
    })
})

describe("occursInRange — guardas de intervalo", () => {
    const diaria = v2({ version: 2, type: "daily" })

    it("endKey anterior a startKey retorna false sem iterar", () => {
        expect(occursInRange(diaria, SAB, DOM)).toBe(false)
    })

    it("dateKey inválido em qualquer ponta retorna false", () => {
        expect(occursInRange(diaria, "nao-e-data", SAB)).toBe(false)
        expect(occursInRange(diaria, DOM, "nao-e-data")).toBe(false)
    })

    it("janela absurda vinda da URL é truncada e não trava", () => {
        const semanal = v2({ version: 2, type: "weekly", weekdays: [] })
        const inicio = performance.now()
        // Sem MAX_RANGE_DAYS isto seriam ~2,9 milhões de iterações.
        expect(occursInRange(semanal, "2026-01-01", "9999-12-31")).toBe(false)
        expect(performance.now() - inicio).toBeLessThan(500)
    })

    it("janela de 1 dia é inclusiva nas duas pontas", () => {
        expect(occursInRange(diaria, TER, TER)).toBe(true)
    })
})

// s96 — regressão do caso reportado em producao (Restaurante Morumbi).
// Um unico turno ativo, SEG..SAB. Ao filtrar por "Dom", rotinas "Dias do turno"
// marcadas como "Todos os turnos" apareciam, enquanto as de turno especifico
// nao — mesmo rotulo, respostas opostas, na mesma tela.
describe("filtro por dia: shift_days respeita os dias do turno", () => {
    const TURNO_MANHA: ShiftForRecurrence[] = [
        { id: "manha", shift_type: "morning", days_of_week: [1, 2, 3, 4, 5, 6] }, // SEG..SÁB
    ]
    const DOMINGO = "2026-08-16"
    const SEGUNDA = "2026-08-17"

    const comTurno: ChecklistForOccurrence = {
        ...v2({ version: 2, type: "shift_days" }),
        shift_ids: ["manha"],
    }
    // "Todos os turnos": sem vinculo N:N e sem enum (ou enum 'any').
    const todosOsTurnos: ChecklistForOccurrence = {
        ...v2({ version: 2, type: "shift_days" }),
        shift: "any",
        shift_ids: [],
    }

    it("nenhuma das duas ocorre no domingo — o restaurante não abre", () => {
        expect(occursInRange(comTurno, DOMINGO, DOMINGO, TURNO_MANHA)).toBe(false)
        expect(occursInRange(todosOsTurnos, DOMINGO, DOMINGO, TURNO_MANHA)).toBe(false)
    })

    it("as duas ocorrem na segunda", () => {
        expect(occursInRange(comTurno, SEGUNDA, SEGUNDA, TURNO_MANHA)).toBe(true)
        expect(occursInRange(todosOsTurnos, SEGUNDA, SEGUNDA, TURNO_MANHA)).toBe(true)
    })

    it("as duas concordam em todos os dias da semana civil", () => {
        for (let i = 0; i < 7; i++) {
            const dia = `2026-08-${String(16 + i).padStart(2, "0")}`
            expect(occursInRange(todosOsTurnos, dia, dia, TURNO_MANHA)).toBe(
                occursInRange(comTurno, dia, dia, TURNO_MANHA),
            )
        }
    })

    it("ambas aparecem no filtro 'Esta semana' — a semana contém dias úteis", () => {
        expect(occursInRange(comTurno, "2026-08-16", "2026-08-22", TURNO_MANHA)).toBe(true)
        expect(occursInRange(todosOsTurnos, "2026-08-16", "2026-08-22", TURNO_MANHA)).toBe(true)
    })

    it("na visão global (sem turnos carregados) o fallback permissivo se mantém", () => {
        expect(occursInRange(todosOsTurnos, DOMINGO, DOMINGO, [])).toBe(true)
        expect(occursInRange(todosOsTurnos, DOMINGO, DOMINGO, undefined)).toBe(true)
    })
})

describe("cenário do briefing — múltiplas rotinas com frequências diferentes", () => {
    const shifts: ShiftForRecurrence[] = []
    const rotinas: Array<{ nome: string; c: ChecklistForOccurrence }> = [
        { nome: "Abertura da cozinha", c: v2({ version: 2, type: "weekly", weekdays: [1, 3, 5] }) },
        { nome: "Limpeza profunda", c: v2({ version: 2, type: "weekly", weekdays: [2] }) },
        { nome: "Conferência de estoque", c: v2({ version: 2, type: "weekly", weekdays: [5] }) },
        { nome: "Higienização dos equipamentos", c: v2({ version: 2, type: "daily" }) },
        {
            nome: "Inventário mensal",
            c: v2({ version: 2, type: "monthly", mode: "day_of_month", day: 15 }),
        },
    ]

    const previstas = (start: string, end: string) =>
        rotinas.filter((r) => occursInRange(r.c, start, end, shifts)).map((r) => r.nome)

    it("segunda-feira", () => {
        expect(previstas(SEG, SEG)).toEqual([
            "Abertura da cozinha",
            "Higienização dos equipamentos",
        ])
    })

    it("terça-feira", () => {
        expect(previstas(TER, TER)).toEqual([
            "Limpeza profunda",
            "Higienização dos equipamentos",
        ])
    })

    it("sexta-feira", () => {
        expect(previstas(SEX, SEX)).toEqual([
            "Abertura da cozinha",
            "Conferência de estoque",
            "Higienização dos equipamentos",
        ])
    })

    it("domingo não tem nenhuma rotina semanal prevista", () => {
        expect(previstas(DOM, DOM)).toEqual(["Higienização dos equipamentos"])
    })

    it("este mês inclui o inventário do dia 15", () => {
        expect(previstas(MES.start, MES.end)).toEqual([
            "Abertura da cozinha",
            "Limpeza profunda",
            "Conferência de estoque",
            "Higienização dos equipamentos",
            "Inventário mensal",
        ])
    })

    it("restaurante sem rotinas previstas para a data devolve lista vazia", () => {
        const soTerca = [{ nome: "Limpeza profunda", c: v2({ version: 2, type: "weekly", weekdays: [2] }) }]
        expect(soTerca.filter((r) => occursInRange(r.c, DOM, DOM, shifts))).toEqual([])
    })
})
