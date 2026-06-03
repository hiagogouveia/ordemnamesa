/**
 * Utilitários puros para a janela de horário das rotinas.
 * Trabalham com strings no formato "HH:MM" (mesmo formato salvo em
 * `checklists.start_time` / `checklists.end_time`).
 */

/** Converte "HH:MM" em minutos desde a meia-noite. `null` se o formato for inválido. */
export function parseTimeToMinutes(time: string | null | undefined): number | null {
    if (!time) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
}

/** Converte minutos desde a meia-noite em "HH:MM". */
function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
}

/**
 * Diferença em minutos entre início e fim.
 * `null` quando algum horário é inválido ou quando fim <= início.
 */
export function durationMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    if (startMin === null || endMin === null) return null;
    const diff = endMin - startMin;
    return diff > 0 ? diff : null;
}

/**
 * Soma uma duração (em minutos) ao horário de início e devolve o fim "HH:MM".
 * `null` quando o início é inválido ou a duração não é positiva.
 * Faz clamp em 23:59 — não cruza a meia-noite.
 */
export function addDuration(start: string | null | undefined, minutes: number): string | null {
    const startMin = parseTimeToMinutes(start);
    if (startMin === null || !Number.isFinite(minutes) || minutes <= 0) return null;
    const endMin = Math.min(startMin + Math.round(minutes), 23 * 60 + 59);
    return minutesToTime(endMin);
}

export type TimeWindowStatus = 'always' | 'before' | 'active' | 'after';

/**
 * Status da janela de horário relativo ao "agora" (string "HH:MM" no fuso do restaurante).
 * - 'always': rotina sem janela definida.
 * - 'before': antes do início (bloqueia) — salvo quando allowEarlyStart=true.
 * - 'after': após o fim (atraso).
 * - 'active': dentro da janela (ou liberada por allowEarlyStart antes do início).
 *
 * Sprint 76: quando allowEarlyStart=true, o início deixa de bloquear; o fim/atraso
 * continua sendo respeitado normalmente.
 */
export function getTimeWindowStatus(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
    currentTime: string,
    allowEarlyStart = false,
): TimeWindowStatus {
    if (!startTime && !endTime) return 'always';
    if (startTime && currentTime < startTime && !allowEarlyStart) return 'before';
    if (endTime && currentTime > endTime) return 'after';
    return 'active';
}

/**
 * Formata uma duração em minutos de forma amigável.
 * 65 → "1h 05min", 90 → "1h 30min", 45 → "45min", 60 → "1h".
 */
export function formatDuration(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes <= 0) return "";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m.toString().padStart(2, "0")}min`;
}
