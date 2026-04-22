import { NextResponse } from 'next/server'
import type { AccessCheck, AccessReason, LimitType } from './types'

interface AccessDeniedBody {
    error: string
    reason: AccessReason
    current?: number
    limit?: number
    limit_type?: LimitType
}

const MESSAGES: Record<AccessReason, string> = {
    no_subscription:
        'Conta sem assinatura ativa. Entre em contato com o suporte.',
    canceled:
        'Sua assinatura foi cancelada. Para voltar a criar/executar, reative o plano.',
    past_due_blocks_writes:
        'Seu período gratuito terminou. Entre em contato para continuar criando recursos.',
    past_due_blocks_execution:
        'Seu período gratuito terminou. Entre em contato para continuar a operação.',
    limit_reached:
        'Limite do plano atingido. Faça upgrade para continuar.',
    unknown_status:
        'Status de assinatura inválido para esta ação. Contate o suporte.',
}

const HTTP_STATUS: Record<AccessReason, number> = {
    no_subscription: 402,
    canceled: 402,
    past_due_blocks_writes: 402,
    past_due_blocks_execution: 402,
    limit_reached: 402,
    unknown_status: 402,
}

/**
 * Converte um AccessCheck negado em NextResponse padronizado.
 * Nunca chame com check.allowed=true — isso seria erro de programação.
 */
export function buildAccessDeniedResponse(check: AccessCheck): NextResponse {
    if (check.allowed) {
        // Não deveria acontecer — mas por segurança, não expor 200 sem payload
        return NextResponse.json(
            { error: 'buildAccessDeniedResponse chamado com check.allowed=true' },
            { status: 500 }
        )
    }
    const reason: AccessReason = check.reason ?? 'unknown_status'
    const body: AccessDeniedBody = {
        error: MESSAGES[reason],
        reason,
    }
    if (check.current !== undefined) body.current = check.current
    if (check.limit !== undefined) body.limit = check.limit
    if (check.limit_type) body.limit_type = check.limit_type
    return NextResponse.json(body, { status: HTTP_STATUS[reason] })
}
