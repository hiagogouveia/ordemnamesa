'use client'

import { createContext, useState, useEffect, useMemo } from 'react'
import { useAuthUser } from '@/lib/hooks/use-auth-user'
import { useRestaurantStore } from '@/lib/store/restaurant-store'
import { useAccountSessionStore } from '@/lib/store/account-session-store'
import type { SessionContextValue, UserRole } from './session-types'

export const SessionContext = createContext<SessionContextValue | null>(null)

// ── Cookie helpers ───────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

interface CookieSnapshot {
  accountId: string | null
  accountName: string | null
  restaurantId: string | null
  restaurantName: string | null
  restaurantSlug: string | null
  restaurantRole: UserRole | null
  restaurantMode: string | null
}

function readSessionCookies(): CookieSnapshot {
  const role = getCookie('x-restaurant-role')
  return {
    accountId: getCookie('x-account-id'),
    accountName: getCookie('x-account-name'),
    restaurantId: getCookie('x-restaurant-id'),
    restaurantName: getCookie('x-restaurant-name'),
    restaurantSlug: getCookie('x-restaurant-slug'),
    restaurantRole: (role === 'owner' || role === 'manager' || role === 'staff') ? role : null,
    restaurantMode: getCookie('x-restaurant-mode'),
  }
}

// ── Null state (reusado para loading e unauthenticated) ─────────────────────

const NULL_STATE = {
  userId: null,
  userName: null,
  user: null,
  restaurantId: null,
  restaurant: null,
  userRole: null,
  account: null,
  isGlobal: false,
} as const

// ── Provider ─────────────────────────────────────────────────────────────────

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Fonte 1: Supabase Auth (via React Query)
  const { data: authUser, isLoading: authLoading } = useAuthUser()

  // Fonte 2 (sinal de reatividade): quando Zustand muda, re-lemos cookies
  const storeRestaurantId = useRestaurantStore((s) => s.restaurantId)
  const storeMode = useAccountSessionStore((s) => s.mode)

  // Estado derivado dos cookies (fonte primária)
  const [cookies, setCookies] = useState<CookieSnapshot>(readSessionCookies)

  // Re-ler cookies quando sinais de reatividade mudam
  useEffect(() => {
    setCookies(readSessionCookies())
  }, [storeRestaurantId, storeMode])

  const value = useMemo<SessionContextValue>(() => {
    if (authLoading) {
      return { status: 'loading', ...NULL_STATE }
    }

    if (!authUser) {
      return { status: 'unauthenticated', ...NULL_STATE }
    }

    const isGlobal = cookies.restaurantMode === 'global'

    return {
      status: 'authenticated',
      user: authUser,
      userId: authUser.id,
      userName: (authUser.user_metadata?.name as string) || 'Membro',
      restaurantId: cookies.restaurantId,
      restaurant:
        cookies.restaurantId && cookies.restaurantName
          ? {
              id: cookies.restaurantId,
              name: cookies.restaurantName,
              slug: cookies.restaurantSlug || '',
            }
          : null,
      userRole: cookies.restaurantRole,
      account:
        cookies.accountId && cookies.accountName
          ? { id: cookies.accountId, name: cookies.accountName }
          : null,
      isGlobal,
    }
  }, [authLoading, authUser, cookies])

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}
