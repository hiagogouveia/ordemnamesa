import type { User } from '@supabase/supabase-js'

export type UserRole = 'owner' | 'manager' | 'staff'

export interface SessionRestaurant {
  id: string
  name: string
  slug: string
}

export interface SessionAccount {
  id: string
  name: string
}

/** Estado nulo compartilhado pelos status loading e unauthenticated */
interface SessionNullState {
  userId: null
  userName: null
  user: null
  restaurantId: null
  restaurant: null
  userRole: null
  account: null
  isGlobal: false
}

interface SessionLoading extends SessionNullState {
  status: 'loading'
}

interface SessionUnauthenticated extends SessionNullState {
  status: 'unauthenticated'
}

interface SessionAuthenticated {
  status: 'authenticated'
  userId: string
  userName: string
  user: User
  restaurantId: string | null
  restaurant: SessionRestaurant | null
  userRole: UserRole | null
  account: SessionAccount | null
  isGlobal: boolean
}

export type SessionContextValue =
  | SessionLoading
  | SessionUnauthenticated
  | SessionAuthenticated
