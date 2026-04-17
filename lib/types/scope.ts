/**
 * Escopo explícito para decidir se uma operação é feita em modo single-unit
 * ou global (visão de todas as unidades da conta).
 *
 * Regra: nunca inferir modo pela ausência de restaurantId.
 * Sempre usar este tipo discriminado.
 */
export type Scope =
    | { mode: 'single'; restaurantId: string }
    | { mode: 'global'; accountId: string }
