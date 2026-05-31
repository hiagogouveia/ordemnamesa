import { Shift } from './types';

function toMins(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

/** Horário atual (em minutos) está dentro da janela do turno? Trata virada de meia-noite. */
function isWithinShift(shift: Shift, nowMins: number): boolean {
    if (!shift.start_time || !shift.end_time) return false;
    const startMins = toMins(shift.start_time);
    const endMins = toMins(shift.end_time);
    if (startMins <= endMins) return nowMins >= startMins && nowMins <= endMins;
    // Turno cruzando a meia-noite (ex.: 23:00 → 06:00)
    return nowMins >= startMins || nowMins <= endMins;
}

export interface MyShiftDisplay {
    /** Turno do usuário a exibir no cabeçalho de "Meu Turno". */
    shift: Shift;
    /** true se o horário atual está dentro da janela deste turno. */
    isActiveNow: boolean;
}

/**
 * Sprint 61 — Escolhe qual turno do usuário exibir no cabeçalho de "Meu Turno".
 * Fonte da verdade é o vínculo user↔shifts (NÃO o relógio para escolher o turno).
 *
 * Regra (documentada com o usuário):
 *  - Se algum turno vinculado estiver ATIVO agora → exibe esse (isActiveNow=true).
 *  - Senão → exibe o PRÓXIMO a iniciar (menor tempo até o início, ciclo de 24h)
 *    com isActiveNow=false (cabeçalho mostra aviso "fora do horário").
 *
 * Retorna null quando o usuário não tem turnos vinculados (vê tudo — sem rótulo).
 */
export function pickMyShiftForHeader(
    userShifts: Shift[],
    currentTimeStr: string = new Date().toTimeString().slice(0, 5),
): MyShiftDisplay | null {
    const valid = (userShifts || []).filter(s => s.active && s.start_time && s.end_time);
    if (valid.length === 0) return null;

    const nowMins = toMins(currentTimeStr);

    const active = valid.find(s => isWithinShift(s, nowMins));
    if (active) return { shift: active, isActiveNow: true };

    // Nenhum ativo → próximo a iniciar (menor distância até o start, mód. 24h).
    let next = valid[0];
    let bestDelta = (toMins(next.start_time!) - nowMins + 1440) % 1440;
    for (const s of valid.slice(1)) {
        const delta = (toMins(s.start_time!) - nowMins + 1440) % 1440;
        if (delta < bestDelta) {
            bestDelta = delta;
            next = s;
        }
    }
    return { shift: next, isActiveNow: false };
}

export function getCurrentShift(shifts: Shift[], currentTimeStr: string = new Date().toTimeString().slice(0, 5)): Shift | null {
    if (!shifts || shifts.length === 0) return null;

    const [currentHour, currentMinute] = currentTimeStr.split(':').map(Number);
    const currentMins = currentHour * 60 + currentMinute;

    for (const shift of shifts) {
        if (!shift.start_time || !shift.end_time || !shift.active) continue;

        const [startHour, startMinute] = shift.start_time.split(':').map(Number);
        const [endHour, endMinute] = shift.end_time.split(':').map(Number);

        const startMins = startHour * 60 + startMinute;
        const endMins = endHour * 60 + endMinute;

        if (startMins <= endMins) {
            // Normal shift (e.g., 08:00 to 16:00)
            if (currentMins >= startMins && currentMins <= endMins) {
                return shift;
            }
        } else {
            // Night shift crossing midnight (e.g., 18:00 to 02:00)
            if (currentMins >= startMins || currentMins <= endMins) {
                return shift;
            }
        }
    }

    return null;
}
