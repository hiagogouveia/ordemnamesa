import { RRule } from "rrule"
import type { RecurrenceV2, WeekOfMonth } from "@/lib/types"

export class RecurrenceValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "RecurrenceValidationError"
    }
}

/**
 * Valida e devolve o input como `RecurrenceV2`. **NÃO faz coerção, normalização
 * nem preenchimento de defaults**: qualquer ausência ou tipo inesperado lança.
 *
 * Política fail-fast: o caller (POST/PUT) deve traduzir o erro em 400.
 */
export function validateV2(input: unknown): RecurrenceV2 {
    if (typeof input !== "object" || input === null) {
        throw new RecurrenceValidationError("recurrence_config deve ser um objeto")
    }

    const obj = input as Record<string, unknown>

    if (obj.version !== 2) {
        throw new RecurrenceValidationError(
            "recurrence_config.version deve ser exatamente 2 (numérico)",
        )
    }

    const type = obj.type
    if (typeof type !== "string") {
        throw new RecurrenceValidationError("recurrence_config.type ausente ou inválido")
    }

    switch (type) {
        case "daily":
            return { version: 2, type: "daily" }

        case "shift_days":
            return { version: 2, type: "shift_days" }

        case "weekly": {
            const weekdays = obj.weekdays
            if (!Array.isArray(weekdays)) {
                throw new RecurrenceValidationError("weekly.weekdays deve ser array")
            }
            if (weekdays.length === 0) {
                throw new RecurrenceValidationError("weekly.weekdays não pode ser vazio")
            }
            for (const d of weekdays) {
                if (!isWeekday(d)) {
                    throw new RecurrenceValidationError(
                        `weekly.weekdays contém valor inválido: ${String(d)} (esperado 0-6)`,
                    )
                }
            }
            const dedup = Array.from(new Set(weekdays as number[])).sort((a, b) => a - b)
            return { version: 2, type: "weekly", weekdays: dedup }
        }

        case "monthly": {
            const mode = obj.mode
            if (mode === "day_of_month") {
                const day = obj.day
                if (!isInt(day) || day < 1 || day > 31) {
                    throw new RecurrenceValidationError(
                        "monthly.day deve ser inteiro entre 1 e 31",
                    )
                }
                return { version: 2, type: "monthly", mode: "day_of_month", day }
            }
            if (mode === "days_of_month") {
                const days = obj.days
                if (!Array.isArray(days)) {
                    throw new RecurrenceValidationError("monthly.days deve ser array")
                }
                if (days.length === 0) {
                    throw new RecurrenceValidationError("monthly.days não pode ser vazio")
                }
                for (const d of days) {
                    if (!isMonthDay(d)) {
                        throw new RecurrenceValidationError(
                            `monthly.days contém valor inválido: ${String(d)} (esperado 1-31 ou -1)`,
                        )
                    }
                }
                const sorted = sortMonthDays(days as number[])
                return { version: 2, type: "monthly", mode: "days_of_month", days: sorted }
            }
            if (mode === "weekday_position") {
                const weekday = obj.weekday
                const weekOfMonth = obj.weekOfMonth
                if (!isWeekday(weekday)) {
                    throw new RecurrenceValidationError(
                        "monthly.weekday deve ser inteiro entre 0 e 6",
                    )
                }
                if (!isWeekOfMonth(weekOfMonth)) {
                    throw new RecurrenceValidationError(
                        "monthly.weekOfMonth deve ser 1, 2, 3, 4 ou -1",
                    )
                }
                return {
                    version: 2,
                    type: "monthly",
                    mode: "weekday_position",
                    weekday,
                    weekOfMonth,
                }
            }
            throw new RecurrenceValidationError(
                "monthly.mode deve ser 'day_of_month', 'days_of_month' ou 'weekday_position'",
            )
        }

        case "yearly": {
            const mode = obj.mode
            if (mode === "date") {
                const day = obj.day
                const month = obj.month
                if (!isInt(month) || month < 1 || month > 12) {
                    throw new RecurrenceValidationError(
                        "yearly.month deve ser inteiro entre 1 e 12",
                    )
                }
                if (!isInt(day) || day < 1 || day > 31) {
                    throw new RecurrenceValidationError(
                        "yearly.day deve ser inteiro entre 1 e 31",
                    )
                }
                // Não validamos correspondência day×month aqui (ex: 31 em fevereiro):
                // o evaluator trata como "pula o mês".
                return { version: 2, type: "yearly", mode: "date", day, month }
            }
            if (mode === "weekday_position") {
                const weekday = obj.weekday
                const weekOfMonth = obj.weekOfMonth
                const month = obj.month
                if (!isWeekday(weekday)) {
                    throw new RecurrenceValidationError(
                        "yearly.weekday deve ser inteiro entre 0 e 6",
                    )
                }
                if (!isWeekOfMonth(weekOfMonth)) {
                    throw new RecurrenceValidationError(
                        "yearly.weekOfMonth deve ser 1, 2, 3, 4 ou -1",
                    )
                }
                if (!isInt(month) || month < 1 || month > 12) {
                    throw new RecurrenceValidationError(
                        "yearly.month deve ser inteiro entre 1 e 12",
                    )
                }
                return {
                    version: 2,
                    type: "yearly",
                    mode: "weekday_position",
                    weekday,
                    weekOfMonth,
                    month,
                }
            }
            throw new RecurrenceValidationError(
                "yearly.mode deve ser 'date' ou 'weekday_position'",
            )
        }

        case "custom": {
            const rrule = obj.rrule
            if (typeof rrule !== "string" || rrule.trim() === "") {
                throw new RecurrenceValidationError("custom.rrule deve ser string não vazia")
            }
            try {
                RRule.fromString(rrule)
            } catch (err) {
                const msg = err instanceof Error ? err.message : "rrule inválida"
                throw new RecurrenceValidationError(`custom.rrule inválida: ${msg}`)
            }
            return { version: 2, type: "custom", rrule }
        }

        default:
            throw new RecurrenceValidationError(`type desconhecido: ${type}`)
    }
}

function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v)
}

function isWeekday(v: unknown): v is number {
    return isInt(v) && v >= 0 && v <= 6
}

/** Dia do mês válido: 1..31 ou o sentinela -1 ("último dia do mês"). */
function isMonthDay(v: unknown): v is number {
    return isInt(v) && ((v >= 1 && v <= 31) || v === -1)
}

/** Dedup + ordena crescente, mantendo o sentinela -1 sempre ao final. */
function sortMonthDays(days: number[]): number[] {
    const unique = Array.from(new Set(days))
    const fixed = unique.filter((d) => d !== -1).sort((a, b) => a - b)
    return unique.includes(-1) ? [...fixed, -1] : fixed
}

function isWeekOfMonth(v: unknown): v is WeekOfMonth {
    return v === 1 || v === 2 || v === 3 || v === 4 || v === -1
}
