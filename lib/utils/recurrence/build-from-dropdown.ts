import type { RecurrenceV2, WeekOfMonth } from "@/lib/types"

export type DropdownRecurrenceOption =
    | "daily"
    | "weekdays"
    | "shift_days"
    | "weekly"
    | "monthly"
    | "yearly"

export interface BuildV2Context {
    /** Dia do mês (1-31) — usado por `yearly date` e ordinal mensal. */
    day: number
    /** Mês (1-12) — usado por `yearly date`. */
    month: number
    /** Dia da semana (0=Dom, 6=Sab) — usado por `weekly` e `monthly weekday_position`. */
    weekday: number
    /**
     * Posição do weekday dentro do mês:
     *  - `1|2|3|4` quando é a Nª ocorrência
     *  - `-1` quando é a última (a próxima ocorrência cai no mês seguinte)
     */
    weekOfMonth: WeekOfMonth
}

/**
 * Mapeia uma opção do dropdown principal de recorrência para o formato v2.
 * O caller é responsável por calcular o `BuildV2Context` a partir da data
 * atual (em fuso de São Paulo via `getBrazilNow()`).
 *
 * Decisão de produto: cada toque no dropdown produz um payload v2 completo,
 * preservando o dia/data atual nas opções "Semanal", "Mensal" e "Anual".
 * Isso resolve o bug R1 (informação que existia no label mas se perdia no banco).
 */
export function buildV2FromDropdownOption(
    option: DropdownRecurrenceOption,
    ctx: BuildV2Context,
): RecurrenceV2 {
    switch (option) {
        case "daily":
            return { version: 2, type: "daily" }

        case "weekdays":
            // "Dias úteis (seg-sex)" no dropdown = weekly com [1..5] em v2
            return { version: 2, type: "weekly", weekdays: [1, 2, 3, 4, 5] }

        case "shift_days":
            return { version: 2, type: "shift_days" }

        case "weekly":
            return { version: 2, type: "weekly", weekdays: [ctx.weekday] }

        case "monthly":
            return {
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: ctx.weekday,
                weekOfMonth: ctx.weekOfMonth,
            }

        case "yearly":
            return {
                version: 2,
                type: "yearly",
                mode: "date",
                day: ctx.day,
                month: ctx.month,
            }
    }
}

/**
 * Calcula a posição do `dayOfMonth` dentro do mês em relação ao seu weekday.
 * Retorna `-1` se for a última ocorrência (não há outra no mesmo mês);
 * caso contrário retorna 1, 2, 3 ou 4.
 *
 * Exemplo: 27 de abril/2026 (segunda) → 4 (4ª segunda do mês). Como abril
 * tem só 4 segundas, a próxima cai em maio → também é -1 (última). Esta
 * função prioriza `-1` quando ambas se aplicam (consistente com a UI atual).
 */
export function computeWeekOfMonth(
    dayOfMonth: number,
    daysInMonthValue: number,
): WeekOfMonth {
    // Se a próxima ocorrência da mesma weekday cai no mês seguinte → última
    if (dayOfMonth + 7 > daysInMonthValue) return -1

    const ordinal = Math.ceil(dayOfMonth / 7)
    if (ordinal === 1 || ordinal === 2 || ordinal === 3 || ordinal === 4) return ordinal
    // Em raros casos (5ª ocorrência), tratamos como última
    return -1
}
