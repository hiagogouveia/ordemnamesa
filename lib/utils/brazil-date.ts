const TZ = 'America/Sao_Paulo'

interface BrazilNow {
    dayOfWeek: number   // 0=Dom, 1=Seg, ..., 6=Sab
    dateKey: string     // YYYY-MM-DD
    timeHHMM: string    // HH:mm
}

export function getBrazilNow(date: Date = new Date()): BrazilNow {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date)

    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find(p => p.type === type)?.value ?? ''

    const dateKey = `${get('year')}-${get('month')}-${get('day')}`

    const weekdayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    }
    const dayOfWeek = weekdayMap[get('weekday')] ?? 0

    const hour = get('hour').padStart(2, '0')
    const minute = get('minute').padStart(2, '0')
    const timeHHMM = `${hour}:${minute}`

    return { dayOfWeek, dateKey, timeHHMM }
}

export function getBrazilDateKey(date?: Date): string {
    return getBrazilNow(date).dateKey
}

export function getBrazilDayOfWeek(date?: Date): number {
    return getBrazilNow(date).dayOfWeek
}

/**
 * Retorna os limites do dia atual em São Paulo como ISO strings (UTC).
 * Útil para queries Supabase com .gte() / .lte().
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
