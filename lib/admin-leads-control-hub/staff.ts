import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase-admin'

const STAFF_TABLE = 'ordemnamesa_staff'

export type StaffRole = 'SUPER_ADMIN' | 'SUPPORT_AGENT'

export async function getStaffRole(
    user: Pick<User, 'id'> | null | undefined
): Promise<StaffRole | null> {
    if (!user) return null

    const { data, error } = await supabaseAdmin
        .from(STAFF_TABLE)
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle<{ role: StaffRole }>()
    if (error || !data) return null
    return data.role
}

export async function getSessionUser(): Promise<User | null> {
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll() {
                    /* read-only context */
                },
            },
        }
    )
    const { data } = await supabase.auth.getUser()
    return data.user ?? null
}

export interface StaffContext {
    user: User
    role: StaffRole
}

export async function requireStaff(): Promise<{ ctx: StaffContext } | { error: string }> {
    const user = await getSessionUser()
    if (!user) return { error: 'Não autenticado.' }
    const role = await getStaffRole(user)
    if (!role) return { error: 'Acesso negado.' }
    return { ctx: { user, role } }
}

export async function requireSuperAdmin(): Promise<{ ctx: StaffContext } | { error: string }> {
    const guard = await requireStaff()
    if ('error' in guard) return guard
    if (guard.ctx.role !== 'SUPER_ADMIN')
        return { error: 'Apenas SUPER_ADMIN pode executar esta ação.' }
    return guard
}
