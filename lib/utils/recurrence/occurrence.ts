/**
 * Sprint 96 — "esta rotina tem ocorrência prevista na data X / no período Y?"
 *
 * ── FONTE ÚNICA DE VERDADE ───────────────────────────────────────────────────
 *
 * Este módulo NÃO implementa recorrência. Ele DELEGA a
 * `shouldChecklistAppearToday`, que já é paramétrica em data (só o nome diz
 * "Today") e que já roteia v2 → `evaluateV2` / v1 → lógica legada. Os mesmos
 * resultados valem, portanto, para /turno, kanban, dashboard, overdue e
 * notificações, que consomem aquela função.
 *
 * Consequência deliberada: não há aqui NENHUM `switch` sobre tipo de recorrência.
 * Um atalho que "adivinhasse" o resultado por tipo seria uma segunda cópia das
 * regras, livre para divergir. O único desvio do caminho comum é o fast path de
 * `custom` — e ele delega ao mesmo `evaluateCustomRange` do evaluator.
 *
 * NÃO usar `preview.ts` como base: é uma réplica simplificada e divergente (não
 * suporta `custom` nem `shift_days` no modelo N:N).
 *
 * Isomórfico de propósito: serve ao filtro do client hoje e a um route handler
 * amanhã, se a listagem ganhar paginação server-side.
 *
 * ── FAIL-OPEN CONHECIDOS (aparecem em TODAS as janelas) ──────────────────────
 *
 * Herdados de `shouldChecklistAppearToday` e mantidos INTACTOS de propósito —
 * corrigi-los mudaria o comportamento de /turno, kanban, dashboard e overdue:
 *
 *  1. v1 `recurrence='monthly'` / `'yearly'` → sempre `true`. O formato v1 não
 *     guarda dia do mês, então não há dado de onde derivar a data.
 *  2. `recurrence` null ou desconhecida → `true`.
 *  3. v1 `weekly` sem `days_of_week` → `true`.
 *  4. `custom` v2 com `FREQ=MONTHLY` puro (gerado por `legacyConfigToV2Rrule`
 *     sem `BYMONTHDAY`) → casa todo dia.
 *  5. `shift_days` sem `shifts` carregados → `true` (acontece na visão global,
 *     onde `useShifts` fica desabilitada).
 *
 * ── LIMITAÇÃO DO MODELO ──────────────────────────────────────────────────────
 *
 * Não existe recorrência de DATA ÚNICA. `RecurrenceV2` não tem tipo `once`, e
 * `is_one_shot` é outra coisa (execução ad-hoc já criada, sem data alvo, e
 * excluída da listagem pelo endpoint). Uma "Dedetização em 15/08/2026" só seria
 * representável via `custom` com rrule — para a qual nem existe UI.
 */

import type { RecurrenceConfig, RecurrenceV2 } from "@/lib/types"
import { addDays, dayOfWeekFromDateKey, daysBetween } from "@/lib/utils/date-key"
import { shouldChecklistAppearToday } from "@/lib/utils/should-checklist-appear-today"
import { evaluateCustomRange, type ShiftForRecurrence } from "./evaluate"
import { parseDateKey } from "./weekday-position"

export interface ChecklistForOccurrence {
    recurrence?: string | null
    recurrence_config?: RecurrenceConfig | RecurrenceV2 | null
    shift?: string | null
    shift_id?: string | null
    shift_ids?: string[] | null
}

/**
 * Teto duro de iteração. Blinda contra um `endKey` corrompido vindo da URL —
 * sem isso, `date:9999-12-31` viraria ~3 milhões de iterações por rotina.
 * 366 cobre a maior janela que a UI produz (mês) com folga de um ano.
 */
export const MAX_RANGE_DAYS = 366

/** A rotina tem ocorrência prevista em `dateKey`? O dia da semana é derivado da própria data. */
export function occursOnDate(
    checklist: ChecklistForOccurrence,
    dateKey: string,
    shifts?: ShiftForRecurrence[],
): boolean {
    const dayOfWeek = dayOfWeekFromDateKey(dateKey)
    if (dayOfWeek === null) return false
    return shouldChecklistAppearToday(checklist, dayOfWeek, dateKey, shifts)
}

/**
 * A rotina tem AO MENOS UMA ocorrência prevista em [startKey, endKey] (inclusivo)?
 *
 * É o OR de `occursOnDate` sobre cada dia do intervalo, com short-circuit no
 * primeiro acerto — uma rotina diária resolve na primeira iteração; uma semanal,
 * em no máximo sete. Só rotinas que NÃO ocorrem percorrem a janela inteira, e
 * mesmo assim são ≤ 31 avaliações aritméticas para o maior filtro da UI.
 */
export function occursInRange(
    checklist: ChecklistForOccurrence,
    startKey: string,
    endKey: string,
    shifts?: ShiftForRecurrence[],
): boolean {
    const span = daysBetween(startKey, endKey)
    // Intervalo inválido ou invertido: nada a mostrar (não itera).
    if (Number.isNaN(span) || span < 0) return false

    const totalDays = Math.min(span + 1, MAX_RANGE_DAYS)

    // ── Único fast path: `custom` resolve o intervalo numa só chamada ────────
    // A união das janelas diárias [D 00:00:00, D 23:59:59] cobre exatamente
    // [start 00:00:00, end 23:59:59], então o resultado é idêntico ao do loop.
    // Vale o desvio porque `RRule.parseString` + construção é a parte cara: sem
    // isso, "Este mês" faria 31 parses de rrule POR ROTINA.
    const config = checklist.recurrence_config
    if (isRecurrenceV2(config) && config.type === "custom") {
        const from = parseDateKey(startKey)
        const to = parseDateKey(addDays(startKey, totalDays - 1))
        if (!from || !to) return false
        return evaluateCustomRange(
            config.rrule,
            new Date(Date.UTC(from.year, from.month - 1, from.day, 0, 0, 0)),
            new Date(Date.UTC(to.year, to.month - 1, to.day, 23, 59, 59)),
        )
    }

    for (let i = 0; i < totalDays; i++) {
        if (occursOnDate(checklist, addDays(startKey, i), shifts)) return true
    }
    return false
}

/** Roteamento estrito v2 — idêntico ao de `should-checklist-appear-today`. */
function isRecurrenceV2(
    config: RecurrenceConfig | RecurrenceV2 | null | undefined,
): config is RecurrenceV2 {
    return (
        typeof config === "object" &&
        config !== null &&
        (config as { version?: unknown }).version === 2
    )
}
