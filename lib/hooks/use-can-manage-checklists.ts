"use client"

import { useBilling } from "./use-billing"

interface CanManageResult {
    /** true apenas quando o billing carregou e `can_create_resources` é true. */
    allowed: boolean
    /** true enquanto o billing ainda está carregando. Consumidores devem
     *  bloquear UI apenas quando `!loading && !allowed` — evita piscar inputs
     *  desabilitados em conexão lenta. O gate server-side é a defesa real. */
    loading: boolean
}

/**
 * Helper client que espelha `canManageChecklists` (server-side). Fonte única
 * via `/api/billing/status`. Não duplica lógica de billing.
 */
export function useCanManageChecklists(): CanManageResult {
    const { data, isLoading } = useBilling()
    if (isLoading) return { allowed: false, loading: true }
    return { allowed: data?.access.can_create_resources ?? false, loading: false }
}
