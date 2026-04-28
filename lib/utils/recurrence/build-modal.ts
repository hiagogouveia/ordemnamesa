import type { RecurrenceV2, WeekOfMonth } from "@/lib/types"

/**
 * Builders de payload v2 para os novos modais de configuração.
 *
 * Política: cada função retorna um `RecurrenceV2` totalmente formado e válido.
 * Validação extra (ex: `weekly` com `weekdays` vazio) é responsabilidade do
 * componente de UI — o helper apenas constrói.
 */

/**
 * "Diário (exceto X dias)" — convertido para `weekly` com a lista de dias
 * permitidos. Quando `excluded` é vazio, vira `daily` puro.
 *
 * Decisão de produto (P2 da sessão de UX): NÃO usar rrule aqui — manter
 * estrutura nativa v2.
 */
export function buildDailyExcept(excluded: number[]): RecurrenceV2 {
    if (!excluded || excluded.length === 0) {
        return { version: 2, type: "daily" }
    }
    const allowed = [0, 1, 2, 3, 4, 5, 6].filter((d) => !excluded.includes(d))
    return { version: 2, type: "weekly", weekdays: allowed }
}

export function buildWeekly(weekdays: number[]): RecurrenceV2 {
    return { version: 2, type: "weekly", weekdays: [...weekdays].sort((a, b) => a - b) }
}

export function buildMonthlyDayOfMonth(day: number): RecurrenceV2 {
    return { version: 2, type: "monthly", mode: "day_of_month", day }
}

export function buildMonthlyWeekdayPosition(
    weekday: number,
    weekOfMonth: WeekOfMonth,
): RecurrenceV2 {
    return {
        version: 2,
        type: "monthly",
        mode: "weekday_position",
        weekday,
        weekOfMonth,
    }
}

export function buildYearlyDate(day: number, month: number): RecurrenceV2 {
    return { version: 2, type: "yearly", mode: "date", day, month }
}

export function buildYearlyWeekdayPosition(
    weekday: number,
    weekOfMonth: WeekOfMonth,
    month: number,
): RecurrenceV2 {
    return {
        version: 2,
        type: "yearly",
        mode: "weekday_position",
        weekday,
        weekOfMonth,
        month,
    }
}
