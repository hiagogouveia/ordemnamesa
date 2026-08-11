/**
 * Sprint 96 — Aritmética PURA de `dateKey` (`YYYY-MM-DD`).
 *
 * Extraído de `temporary-transfer.ts` (s94), que passou a re-exportar daqui: a
 * mesma aritmética de dia civil serve à janela de transferência e ao filtro por
 * ocorrência prevista das rotinas, e duas cópias divergiriam.
 *
 * ── Por que `YYYY-MM-DD` e não `Date` ────────────────────────────────────────
 *
 * `dateKey` é um DIA CIVIL no fuso do restaurante, não um instante. Comparações
 * são LEXICAIS — formato em que ordem alfabética e cronológica coincidem —, o que
 * evita a armadilha do `new Date('2026-07-22')`, interpretado como meia-noite UTC
 * e que em São Paulo volta um dia (mesma razão documentada em `formatDateBR`).
 *
 * Toda conta interna é feita em UTC DE PROPÓSITO: somar 1 dia é sempre +1 no
 * calendário, inclusive no dia em que o relógio muda (DST-neutro).
 *
 * O `hoje` NUNCA é derivado aqui: vem de `getNowInTz(tz).dateKey` com o fuso do
 * restaurante e é passado como parâmetro. Uma função que chamasse `new Date()`
 * por conta própria usaria o fuso do servidor (ou do navegador) e reintroduziria
 * a classe de bug dos falsos "ATRASADO" (s73).
 */

import { daysInMonth, parseDateKey } from "./recurrence/weekday-position";

/** Data no formato Postgres DATE / `dateKey`: `YYYY-MM-DD`. */
export type DateKey = string;

/** `Date` (UTC) → `YYYY-MM-DD`. Sempre em UTC — nunca no fuso do processo. */
function toDateKey(d: Date): DateKey {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
}

/** `true` se a string é uma data `YYYY-MM-DD` sintática e calendaricamente válida. */
export function isValidDateKey(value: unknown): value is DateKey {
    if (typeof value !== "string") return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return false;
    // Rejeita 2026-02-30: o roundtrip só bate em datas que existem.
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return toDateKey(d) === value;
}

/**
 * Soma dias a um `dateKey`. Aritmética em UTC (ver cabeçalho).
 * `dateKey` malformado é devolvido intacto — contrato herdado de s94.
 */
export function addDays(dateKey: DateKey, days: number): DateKey {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!m) return dateKey;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    d.setUTCDate(d.getUTCDate() + days);
    return toDateKey(d);
}

/**
 * Dia da semana do `dateKey`: 0=domingo … 6=sábado.
 *
 * Mesma convenção usada em todo o produto (`getNowInTz().dayOfWeek`,
 * `evaluateV2`, `WEEKDAY_NAMES`). Retorna `null` para `dateKey` inválido, em vez
 * de um número errado — quem consome decide o fallback.
 */
export function dayOfWeekFromDateKey(dateKey: DateKey): number | null {
    const parsed = parseDateKey(dateKey);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

/**
 * Domingo da semana civil que contém `dateKey`.
 *
 * Convenção DOMINGO → SÁBADO, decidida na s96 e coerente com o índice 0=domingo
 * já usado em `WEEKDAY_NAMES` e no evaluator. Quando `dateKey` já é domingo,
 * devolve o próprio dia.
 */
export function startOfWeekSunday(dateKey: DateKey): DateKey {
    const dow = dayOfWeekFromDateKey(dateKey);
    if (dow === null) return dateKey;
    return addDays(dateKey, -dow);
}

/** Sábado da semana civil que contém `dateKey`. Sábado devolve o próprio dia. */
export function endOfWeekSaturday(dateKey: DateKey): DateKey {
    const dow = dayOfWeekFromDateKey(dateKey);
    if (dow === null) return dateKey;
    return addDays(dateKey, 6 - dow);
}

/** Dia 1 do mês de `dateKey`. */
export function startOfMonth(dateKey: DateKey): DateKey {
    const parsed = parseDateKey(dateKey);
    if (!parsed) return dateKey;
    const mo = String(parsed.month).padStart(2, "0");
    return `${parsed.year}-${mo}-01`;
}

/** Último dia do mês de `dateKey` (28/29/30/31 conforme o calendário). */
export function endOfMonth(dateKey: DateKey): DateKey {
    const parsed = parseDateKey(dateKey);
    if (!parsed) return dateKey;
    const mo = String(parsed.month).padStart(2, "0");
    const last = String(daysInMonth(parsed.year, parsed.month)).padStart(2, "0");
    return `${parsed.year}-${mo}-${last}`;
}

/**
 * Distância em dias entre dois `dateKey` (`b - a`). Negativa se `b` < `a`.
 * `NaN` se qualquer um for inválido.
 */
export function daysBetween(a: DateKey, b: DateKey): number {
    const pa = parseDateKey(a);
    const pb = parseDateKey(b);
    if (!pa || !pb) return NaN;
    const ms =
        Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day);
    return Math.round(ms / 86_400_000);
}
