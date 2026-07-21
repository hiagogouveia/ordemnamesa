/**
 * Sprint 94 — Utilitários PUROS da transferência temporária de responsável.
 *
 * Isomórfico de propósito (sem `server-only`, sem banco): o modal, o reconciliador
 * e os testes importam daqui, e é essa importação em comum que impede a UI e o job
 * de divergirem sobre o que significa "a janela está aberta".
 *
 * ── ADR-1: por que tudo aqui é `YYYY-MM-DD`, e não `Date` ────────────────────
 *
 * A janela é DATADA POR DIA no fuso do restaurante, não por instante. Todas as
 * comparações são LEXICAIS sobre `YYYY-MM-DD` — formato em que ordem alfabética e
 * ordem cronológica coincidem. Isso evita a armadilha clássica do
 * `new Date('2026-07-22')`, que o JS interpreta como meia-noite UTC e que, em
 * São Paulo, volta um dia (mesma razão documentada em `formatDateBR`).
 *
 * O `hoje` NUNCA é derivado aqui: vem sempre de `getNowInTz(tz).dateKey` com o fuso
 * do restaurante, e é passado como parâmetro. Uma função que chamasse `new Date()`
 * por conta própria usaria o fuso do servidor (ou do navegador) e reintroduziria
 * exatamente a classe de bug dos falsos "ATRASADO".
 */

/** Data no formato Postgres DATE / `dateKey`: `YYYY-MM-DD`. */
export type DateKey = string;

export type TemporaryTransferStatus = "scheduled" | "active" | "ended";

export type TemporaryTransferEndedReason =
    | "expired"
    | "cancelled"
    | "superseded"
    | "target_inactive";

export type TransferReasonCode =
    | "ferias"
    | "folga"
    | "atestado"
    | "treinamento"
    | "cobertura_turno"
    | "outro";

/**
 * ADR-3 — vocabulário do motivo. Fonte ÚNICA dos rótulos: `<select>` do modal,
 * tooltip do badge e histórico leem daqui, então não existe "Férias" escrito em
 * três lugares com três grafias.
 *
 * A ordem é a de exibição — do mais frequente na operação para o menos.
 */
export const TRANSFER_REASONS: ReadonlyArray<{ code: TransferReasonCode; label: string }> = [
    { code: "ferias", label: "Férias" },
    { code: "folga", label: "Folga" },
    { code: "atestado", label: "Atestado" },
    { code: "treinamento", label: "Treinamento" },
    { code: "cobertura_turno", label: "Cobertura de turno" },
    { code: "outro", label: "Outro" },
];

const REASON_LABELS = new Map<string, string>(
    TRANSFER_REASONS.map((r) => [r.code, r.label]),
);

/** Rótulo legível do motivo. `null` quando não houve motivo informado (é opcional). */
export function reasonLabel(code: string | null | undefined): string | null {
    if (!code) return null;
    return REASON_LABELS.get(code) ?? null;
}

export function isTransferReasonCode(v: unknown): v is TransferReasonCode {
    return typeof v === "string" && REASON_LABELS.has(v);
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

/** `Date` (UTC) → `YYYY-MM-DD`. Sempre em UTC — nunca no fuso do processo. */
function toDateKey(d: Date): DateKey {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
}

/**
 * Soma dias a um `dateKey`. Aritmética feita em UTC de propósito: `dateKey` é um dia
 * civil, não um instante, então DST não participa da conta (somar 1 dia é sempre
 * +1 no calendário, mesmo no dia em que o relógio muda).
 */
export function addDays(dateKey: DateKey, days: number): DateKey {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!m) return dateKey;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    d.setUTCDate(d.getUTCDate() + days);
    return toDateKey(d);
}

/**
 * Duração da janela em dias, INCLUSIVA nas duas pontas.
 * 22/07 → 22/07 = 1 dia (não zero): a rotina fica com o substituto o dia inteiro.
 */
export function daysBetweenInclusive(startsOn: DateKey, endsOn: DateKey): number {
    const parse = (k: DateKey) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
        return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
    };
    const a = parse(startsOn);
    const b = parse(endsOn);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.floor((b - a) / 86_400_000) + 1;
}

/** Campos mínimos para decidir o estado da janela. */
export interface TransferWindow {
    starts_on: DateKey;
    ends_on: DateKey;
    status: TemporaryTransferStatus;
}

/**
 * A janela cobre `today`? Comparação lexical inclusiva nas duas pontas.
 * `today` DEVE vir de `getNowInTz(restaurants.timezone).dateKey`.
 */
export function isWithinWindow(w: Pick<TransferWindow, "starts_on" | "ends_on">, today: DateKey): boolean {
    return w.starts_on <= today && today <= w.ends_on;
}

/** Deve ser ATIVADA agora? (agendada e a janela já abriu.) */
export function shouldActivate(w: TransferWindow, today: DateKey): boolean {
    return w.status === "scheduled" && w.starts_on <= today;
}

/**
 * Deve EXPIRAR agora? (vigente e a janela já fechou.)
 *
 * ADR-2: quando `ends_on` puder ser nulo ("sem previsão de retorno"), este predicado
 * já estará correto sem mudança — `null < today` é falso, então a janela nunca expira.
 */
export function shouldExpire(w: TransferWindow, today: DateKey): boolean {
    return w.status === "active" && w.ends_on < today;
}

/** A transferência está vigente HOJE (é ela quem manda no responsável)? */
export function isTransferActive(
    t: Pick<TransferWindow, "status"> | null | undefined,
): boolean {
    return t?.status === "active";
}

/** Transferência viva = ocupa a vaga da rotina (índice único parcial `uq_ctt_one_open`). */
export function isTransferOpen(
    t: Pick<TransferWindow, "status"> | null | undefined,
): boolean {
    return t?.status === "scheduled" || t?.status === "active";
}

/** `2026-07-22` → `22/07`. Ano omitido: a janela é curta e o ano só polui a UI. */
export function formatShortBR(dateKey: DateKey): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    return m ? `${m[3]}/${m[2]}` : dateKey;
}

/** Ex.: `"22/07 até 29/07 (8 dias)"` — usado no resumo do modal e no tooltip. */
export function describeTransferPeriod(startsOn: DateKey, endsOn: DateKey): string {
    const days = daysBetweenInclusive(startsOn, endsOn);
    const unit = days === 1 ? "dia" : "dias";
    return `${formatShortBR(startsOn)} até ${formatShortBR(endsOn)} (${days} ${unit})`;
}

/**
 * Atalhos de período do modal. Eles apenas PREENCHEM as datas — quem manda continua
 * sendo o par (início, fim), que o gestor vê e confirma. Contar dias como fonte da
 * verdade geraria a ambiguidade clássica ("7 dias inclui hoje?"); aqui a resposta é
 * explícita e visível: `dias` é inclusivo, então "1 semana" a partir de 22/07
 * termina em 28/07.
 */
export const PERIOD_PRESETS: ReadonlyArray<{ label: string; days: number }> = [
    { label: "Hoje", days: 1 },
    { label: "3 dias", days: 3 },
    { label: "1 semana", days: 7 },
    { label: "15 dias", days: 15 },
];

/** Data-fim resultante de aplicar um preset de `days` dias (inclusivos) ao início. */
export function endDateForPreset(startsOn: DateKey, days: number): DateKey {
    return addDays(startsOn, Math.max(1, days) - 1);
}

/** Resultado da validação da janela. `null` = válida. */
export function validateWindow(
    startsOn: unknown,
    endsOn: unknown,
    today: DateKey,
): string | null {
    if (!isValidDateKey(startsOn)) return "Informe uma data de início válida.";
    if (!isValidDateKey(endsOn)) return "Informe uma data de fim válida.";
    if (startsOn < today) return "A data de início não pode ser anterior a hoje.";
    if (endsOn < startsOn) return "A data de fim não pode ser anterior à data de início.";
    return null;
}
