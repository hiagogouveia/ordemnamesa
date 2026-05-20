import type { Shift } from '@/lib/types/audit';
import { SHIFT_LABEL } from '@/lib/types/audit';

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});
const TIME_FMT = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
});
const DATETIME_FMT = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

export function formatDate(iso: string): string {
    return DATE_FMT.format(new Date(iso));
}

export function formatTime(iso: string): string {
    return TIME_FMT.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
    return DATETIME_FMT.format(new Date(iso));
}

export function formatDuration(seconds: number | null): string {
    if (seconds === null || seconds < 0) return '—';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return s > 0 ? `${m}min ${s}s` : `${m}min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}min` : `${h}h`;
}

export function formatShift(s: Shift | null): string {
    return s ? SHIFT_LABEL[s] : '—';
}
