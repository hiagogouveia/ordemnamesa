'use client'

import { useContext } from 'react'
import { SessionContext } from './session-provider'
import type { SessionContextValue } from './session-types'

/**
 * Hook centralizado para acessar o contexto de sessão.
 * Fonte de verdade: cookies (restaurantId, role, account) + Supabase Auth (userId).
 *
 * Deve ser usado dentro de <SessionProvider>.
 */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (ctx === null) {
    throw new Error(
      'useSession() deve ser usado dentro de <SessionProvider>. ' +
      'Verifique se app/(app)/layout.tsx envolve com <SessionProvider>.'
    )
  }
  return ctx
}
