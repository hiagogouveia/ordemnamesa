import { getBrazilNow } from '@/lib/utils/brazil-date'

/**
 * Calcula `ends_at` para um novo trial representando o **fim do dia em
 * America/Sao_Paulo** N dias após hoje. Ex.: trial criado às 14h SP de
 * 10-mai termina às 23:59:59 SP de 09-jun (para N=30).
 *
 * Antes, o cálculo era `Date.now() + N * 86400_000` (instante UTC exato),
 * que para usuários em SP (UTC-3) significava que trials criados após 21h
 * BRT expiravam ~3h antes do "fim do dia D+N". O fix aqui alinha persistência
 * com a expectativa de produto e elimina divergência entre banner e gate.
 *
 * Implementação: usa o `dateKey` (YYYY-MM-DD em SP) do dia D+N como base
 * e ancora 23:59:59.999 com offset fixo -03:00 (SP sem horário de verão
 * desde 2019). Retorna ISO string em UTC (timestamptz).
 */
export function getTrialEndsAtIso(trialDays: number, from: Date = new Date()): string {
    const future = new Date(from.getTime() + trialDays * 86400_000)
    const { dateKey } = getBrazilNow(future)
    return new Date(`${dateKey}T23:59:59.999-03:00`).toISOString()
}
