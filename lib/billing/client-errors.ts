import type { AccessReason } from './types'

/**
 * Erro de billing propagado do server (HTTP 402) para o cliente.
 * Permite que componentes diferenciem "trial expirado" de erros genéricos
 * (network, 5xx, validação) sem inspecionar `Error.message`.
 *
 * NÃO importar `next/server` neste arquivo — ele entra no bundle client.
 */
export class BillingError extends Error {
    readonly status: number
    readonly reason?: AccessReason

    constructor(message: string, status: number, reason?: AccessReason) {
        super(message)
        this.name = 'BillingError'
        this.status = status
        this.reason = reason
    }
}

export function isBillingError(e: unknown): e is BillingError {
    return e instanceof BillingError
}

interface BillingErrorBody {
    error?: string
    reason?: AccessReason
}

/**
 * Converte um Response 402 com payload `{ error, reason }` em BillingError.
 * Retorna null se o status não for 402 ou o body não tiver `reason`.
 *
 * Consome o body — o caller deve clonar (`res.clone()`) se precisar reler.
 */
export async function parseBillingError(res: Response): Promise<BillingError | null> {
    if (res.status !== 402) return null
    let body: BillingErrorBody = {}
    try {
        body = (await res.json()) as BillingErrorBody
    } catch {
        return null
    }
    if (!body.reason) return null
    return new BillingError(body.error ?? 'Acesso bloqueado pelo plano.', res.status, body.reason)
}
