import type { RecurrenceConfig, RecurrenceV2 } from "@/lib/types"

const WEEKDAY_NAMES = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
]

const MONTH_NAMES = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
]

const POSITION_LABELS: Record<string, string> = {
    "1": "primeira",
    "2": "segunda",
    "3": "terceira",
    "4": "quarta",
    "-1": "última",
}

export interface DescribeInput {
    recurrence?: string | null
    recurrence_config?: RecurrenceConfig | RecurrenceV2 | null
}

/**
 * Gera um label legível para o admin descrever a recorrência.
 * Aceita v1 (legado) e v2. Caller (UI) decide formatação final.
 */
export function describeRecurrence(input: DescribeInput): string {
    const config = input.recurrence_config

    // v2
    if (
        typeof config === "object" &&
        config !== null &&
        (config as { version?: unknown }).version === 2
    ) {
        return describeV2(config as RecurrenceV2)
    }

    // v1
    return describeV1(input.recurrence ?? null, (config as RecurrenceConfig | null) ?? null)
}

function describeV2(config: RecurrenceV2): string {
    switch (config.type) {
        case "daily":
            return "Todos os dias"
        case "shift_days":
            return "Dias do turno"
        case "weekly":
            return formatWeeklyDays(config.weekdays)
        case "monthly":
            if (config.mode === "day_of_month") {
                return `Mensal: dia ${config.day}`
            }
            return `Mensal: ${POSITION_LABELS[String(config.weekOfMonth)] ?? "?"} ${
                WEEKDAY_NAMES[config.weekday] ?? "?"
            } do mês`
        case "yearly":
            if (config.mode === "date") {
                return `Anual em ${config.day} de ${MONTH_NAMES[config.month - 1] ?? "?"}`
            }
            return `Anual: ${POSITION_LABELS[String(config.weekOfMonth)] ?? "?"} ${
                WEEKDAY_NAMES[config.weekday] ?? "?"
            } de ${MONTH_NAMES[config.month - 1] ?? "?"}`
        case "custom":
            return "Personalizada"
    }
}

function describeV1(recurrence: string | null, config: RecurrenceConfig | null): string {
    switch (recurrence) {
        case "daily":
            return "Todos os dias"
        case "weekdays":
            return "Dias úteis (seg-sex)"
        case "weekly":
            return "Semanal"
        case "monthly":
            return "Mensal"
        case "yearly":
            return "Anual"
        case "shift_days":
            return "Dias do turno"
        case "custom":
            if (config?.frequency === "weekly" && config.days_of_week?.length) {
                return formatWeeklyDays(config.days_of_week)
            }
            return "Personalizada"
        default:
            return "Sem recorrência"
    }
}

function formatWeeklyDays(weekdays: number[]): string {
    if (weekdays.length === 0) return "Semanal"

    const sorted = [...weekdays].sort((a, b) => a - b)

    // Caso especial: seg-sex
    if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
        return "Dias úteis (seg-sex)"
    }
    // Caso especial: sáb-dom
    if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) {
        return "Fins de semana"
    }
    // Todos os dias
    if (sorted.length === 7) return "Todos os dias"

    if (sorted.length === 1) {
        return `Toda ${WEEKDAY_NAMES[sorted[0]]}`
    }

    const names = sorted.map((d) => shortWeekdayName(d))
    return `Semanal: ${names.join(", ")}`
}

function shortWeekdayName(d: number): string {
    const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
    return names[d] ?? "?"
}
