// Sprint 73 — Fusos IANA do Brasil suportados. Fonte única (espelha o CHECK
// `restaurants_timezone_check` em supabase/migrations/20260601_s73_restaurants_timezone.sql).
// Reutilizado por: signup, units/[id] (validação), detecção no cadastro.

export const DEFAULT_BR_TIMEZONE = 'America/Sao_Paulo'

export const BR_TIMEZONES = new Set<string>([
    'America/Sao_Paulo',   // GMT-3 (default)
    'America/Bahia',
    'America/Fortaleza',
    'America/Recife',
    'America/Maceio',
    'America/Belem',
    'America/Araguaina',
    'America/Campo_Grande', // GMT-4
    'America/Cuiaba',
    'America/Manaus',
    'America/Boa_Vista',
    'America/Porto_Velho',
    'America/Rio_Branco',    // GMT-5
    'America/Eirunepe',
    'America/Noronha',       // GMT-2
])

/** True se `tz` é um fuso BR suportado (aceito pelo CHECK do banco). */
export function isValidBrTimezone(tz: string | null | undefined): tz is string {
    return !!tz && BR_TIMEZONES.has(tz)
}

/** Retorna `tz` se for um fuso BR válido; caso contrário, o default São Paulo. */
export function normalizeBrTimezone(tz: string | null | undefined): string {
    return isValidBrTimezone(tz) ? tz : DEFAULT_BR_TIMEZONE
}
