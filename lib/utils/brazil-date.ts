// Sprint 73 — Fuso padrão (preserva comportamento da base existente).
export const DEFAULT_TZ = 'America/Sao_Paulo'

interface TzNow {
    dayOfWeek: number   // 0=Dom, 1=Seg, ..., 6=Sab
    dateKey: string     // YYYY-MM-DD
    timeHHMM: string    // HH:mm
    minutes: number     // minutos desde 00:00 (h*60+m) no fuso
}

// Cache de formatters por fuso (evita recriar Intl em loops).
const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()
function formatterFor(tz: string): Intl.DateTimeFormat {
    let fmt = FORMATTER_CACHE.get(tz)
    if (!fmt) {
        fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric', month: '2-digit', day: '2-digit',
            weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
        })
        FORMATTER_CACHE.set(tz, fmt)
    }
    return fmt
}

/**
 * Sprint 73 — Fonte única de data/hora operacional.
 * Retorna dia/data/hora no FUSO do restaurante (IANA). Use sempre este
 * helper (server e client) com o timezone do restaurante; nunca a hora
 * do navegador nem um fuso fixo.
 */
export function getNowInTz(tz: string = DEFAULT_TZ, date: Date = new Date()): TzNow {
    const parts = formatterFor(tz).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find(p => p.type === type)?.value ?? ''

    const dateKey = `${get('year')}-${get('month')}-${get('day')}`
    const weekdayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    }
    const dayOfWeek = weekdayMap[get('weekday')] ?? 0
    const hh = get('hour').padStart(2, '0')
    const mm = get('minute').padStart(2, '0')
    return {
        dayOfWeek,
        dateKey,
        timeHHMM: `${hh}:${mm}`,
        minutes: Number(hh) * 60 + Number(mm),
    }
}

/** @deprecated Use getNowInTz(tz) com o fuso do restaurante. Alias = fuso padrão. */
export function getBrazilNow(date: Date = new Date()): TzNow {
    return getNowInTz(DEFAULT_TZ, date)
}

export function getBrazilDateKey(date?: Date): string {
    return getNowInTz(DEFAULT_TZ, date).dateKey
}

export function getBrazilDayOfWeek(date?: Date): number {
    return getNowInTz(DEFAULT_TZ, date).dayOfWeek
}

/**
 * Formata uma data no formato `YYYY-MM-DD` (Postgres DATE) para `DD/MM/YYYY`.
 * Não converte fuso — operação puramente lexical para evitar bugs de timezone
 * comuns ao usar `new Date('YYYY-MM-DD')` (o JS interpreta como UTC midnight,
 * o que move o dia para trás em São Paulo).
 *
 * Retorna a string original como fallback se o formato for inesperado.
 */
export function formatDateBR(value: string | null | undefined): string {
    if (!value) return ''
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (!match) return value
    return `${match[3]}/${match[2]}/${match[1]}`
}

// Sprint 73 — offset (minutos) de um fuso IANA num instante (DST-safe).
function tzOffsetMinutes(tz: string, at: Date): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const p: Record<string, string> = {}
    for (const part of dtf.formatToParts(at)) p[part.type] = part.value
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
    return Math.round((asUTC - at.getTime()) / 60000)
}

/**
 * Sprint 73 — ISO (UTC) do início do dia local (00:00) num fuso IANA.
 * Para filtros Supabase .gte()/.lte() corretos por restaurante.
 */
export function getStartOfDayIsoInTz(tz: string, dateKey: string): string {
    const ref = new Date(`${dateKey}T12:00:00Z`)
    const off = tzOffsetMinutes(tz, ref) // ex.: SP=-180, Manaus=-240
    const sign = off >= 0 ? '+' : '-'
    const abs = Math.abs(off)
    const hh = String(Math.floor(abs / 60)).padStart(2, '0')
    const mm = String(abs % 60).padStart(2, '0')
    return new Date(`${dateKey}T00:00:00.000${sign}${hh}:${mm}`).toISOString()
}

export function getDayRangeIsoInTz(tz: string, dateKey: string): { start: string; end: string } {
    const start = getStartOfDayIsoInTz(tz, dateKey)
    // fim = início do próximo dia - 1ms
    const next = new Date(new Date(`${dateKey}T00:00:00Z`).getTime() + 24 * 3600 * 1000)
    const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
    const end = new Date(new Date(getStartOfDayIsoInTz(tz, nextKey)).getTime() - 1).toISOString()
    return { start, end }
}

/**
 * Retorna os limites do dia atual em São Paulo como ISO strings (UTC).
 * @deprecated Use getDayRangeIsoInTz(tz, dateKey) com o fuso do restaurante.
 */
export function getBrazilStartAndEndOfDay(date?: Date): { start: string; end: string } {
    const { dateKey } = getBrazilNow(date)
    // São Paulo é UTC-3 (ou UTC-2 em horário de verão, abolido desde 2019)
    // Usar offset fixo de -03:00
    const start = `${dateKey}T00:00:00.000-03:00`
    const end = `${dateKey}T23:59:59.999-03:00`
    return {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
    }
}
