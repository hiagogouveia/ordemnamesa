import type { WeekOfMonth } from "@/lib/types"

/**
 * Resolve o dia do mês em que cai a "Nª weekday" de um mês.
 *
 * @param year     Ano (4 dígitos)
 * @param month    Mês 1-12 (1=janeiro)
 * @param weekday  Dia da semana 0-6 (0=domingo)
 * @param position 1|2|3|4 = N-ésima ocorrência; -1 = última ocorrência do mês
 * @returns Dia do mês (1-31) onde cai a posição pedida, ou `null` se não existir
 *          (ex: "5ª segunda" em um mês com apenas 4 segundas).
 *
 * Usa UTC para evitar dependência do timezone do servidor — `getDay()` em datas
 * de calendário (sem componente de hora) é independente de fuso.
 */
export function findWeekdayPositionInMonth(
    year: number,
    month: number,
    weekday: number,
    position: WeekOfMonth,
): number | null {
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null
    if (month < 1 || month > 12) return null
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null

    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

    if (position === -1) {
        for (let day = lastDay; day >= 1; day--) {
            const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
            if (dow === weekday) return day
        }
        return null
    }

    if (position < 1 || position > 4) return null

    let count = 0
    for (let day = 1; day <= lastDay; day++) {
        const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
        if (dow === weekday) {
            count++
            if (count === position) return day
        }
    }
    return null
}

/**
 * Quebra uma data ISO YYYY-MM-DD em componentes numéricos sem depender de
 * timezone — apenas parsing textual. Retorna null se o formato for inválido.
 */
export function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (month < 1 || month > 12) return null
    if (day < 1 || day > 31) return null
    return { year, month, day }
}

/**
 * Retorna o número de dias do mês indicado (mês 1-12).
 */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
