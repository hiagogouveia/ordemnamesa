import type { RecurrenceConfig, RecurrenceV2 } from "@/lib/types"

const DAYS_RRULE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

/**
 * Converte o output do `RecurrencePicker` (formato v1 `RecurrenceConfig`) em
 * um payload v2 do tipo `'custom'` carregando uma string rrule (RFC 5545).
 *
 * Regras de mapeamento:
 *  - `frequency` → `FREQ=DAILY|WEEKLY|MONTHLY`
 *  - `interval`  → `INTERVAL=N` (omitido quando N=1, padrão da spec)
 *  - `days_of_week` em weekly → `BYDAY=MO,WE,FR...`
 *  - `end_type='date'` + `end_date='YYYY-MM-DD'` → `UNTIL=YYYYMMDDT235959Z`
 *  - `end_type='count'` + `end_count=N` → `COUNT=N`
 *  - `end_type='never'` → nada
 */
export function legacyConfigToV2Rrule(config: RecurrenceConfig): RecurrenceV2 {
    const parts: string[] = []
    const freq = config.frequency.toUpperCase() // 'DAILY' | 'WEEKLY' | 'MONTHLY'
    parts.push(`FREQ=${freq}`)

    if (config.interval && config.interval > 1) {
        parts.push(`INTERVAL=${config.interval}`)
    }

    if (
        config.frequency === "weekly" &&
        Array.isArray(config.days_of_week) &&
        config.days_of_week.length > 0
    ) {
        const dedup = Array.from(new Set(config.days_of_week)).sort((a, b) => a - b)
        const byday = dedup
            .filter((d) => d >= 0 && d <= 6)
            .map((d) => DAYS_RRULE[d])
            .join(",")
        if (byday) parts.push(`BYDAY=${byday}`)
    }

    if (config.end_type === "date" && config.end_date) {
        // YYYY-MM-DD → YYYYMMDDT235959Z (final do dia em UTC)
        const compact = config.end_date.replace(/-/g, "")
        parts.push(`UNTIL=${compact}T235959Z`)
    } else if (config.end_type === "count" && config.end_count && config.end_count > 0) {
        parts.push(`COUNT=${config.end_count}`)
    }

    return { version: 2, type: "custom", rrule: parts.join(";") }
}
