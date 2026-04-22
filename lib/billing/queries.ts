import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * COUNT de unidades ativas (não soft-deleted) de uma account.
 * Usado no enforcement de plan.max_units.
 */
export async function countUnits(
    admin: SupabaseClient,
    accountId: string
): Promise<number> {
    const { count, error } = await admin
        .from('restaurants')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('active', true)
        .is('deleted_at', null)

    if (error) throw error
    return count ?? 0
}

/**
 * COUNT de managers distintos em toda a account.
 *
 * Um usuário é considerado manager se:
 *  - tem row ativa em account_users com role='manager', OU
 *  - tem row ativa em restaurant_users com role='manager' em qualquer unidade
 *    da account.
 *
 * Owners nunca contam. Usuário em múltiplas unidades como manager conta
 * apenas 1× (DISTINCT). Usa admin (service_role) porque precisa ler
 * restaurant_users de todas as unidades da account.
 */
export async function countManagers(
    admin: SupabaseClient,
    accountId: string
): Promise<number> {
    // Managers em account_users
    const { data: accountManagers, error: accountErr } = await admin
        .from('account_users')
        .select('user_id')
        .eq('account_id', accountId)
        .eq('role', 'manager')
        .eq('active', true)
        .returns<Array<{ user_id: string }>>()

    if (accountErr) throw accountErr

    // Managers em restaurant_users (de todas as unidades ativas da account)
    const { data: restaurantIds, error: restErr } = await admin
        .from('restaurants')
        .select('id')
        .eq('account_id', accountId)
        .eq('active', true)
        .is('deleted_at', null)
        .returns<Array<{ id: string }>>()

    if (restErr) throw restErr

    const ids = (restaurantIds ?? []).map((r) => r.id)

    let restaurantManagers: Array<{ user_id: string }> = []
    if (ids.length > 0) {
        const { data, error } = await admin
            .from('restaurant_users')
            .select('user_id')
            .in('restaurant_id', ids)
            .eq('role', 'manager')
            .eq('active', true)
            .returns<Array<{ user_id: string }>>()

        if (error) throw error
        restaurantManagers = data ?? []
    }

    const distinct = new Set<string>()
    for (const row of accountManagers ?? []) distinct.add(row.user_id)
    for (const row of restaurantManagers) distinct.add(row.user_id)
    return distinct.size
}

/**
 * Retorna true se o usuário já consta como manager (ativo) em qualquer
 * lugar da account: account_users OU restaurant_users de qualquer unidade.
 *
 * Usado para detectar que promover esse user a manager em outra unidade
 * NÃO consome cota adicional (contagem é DISTINCT).
 */
export async function isUserManagerInAccount(
    admin: SupabaseClient,
    accountId: string,
    userId: string
): Promise<boolean> {
    const { data: accountRow } = await admin
        .from('account_users')
        .select('id')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .eq('role', 'manager')
        .eq('active', true)
        .maybeSingle<{ id: string }>()
    if (accountRow) return true

    const { data: restaurantIds } = await admin
        .from('restaurants')
        .select('id')
        .eq('account_id', accountId)
        .eq('active', true)
        .is('deleted_at', null)
        .returns<Array<{ id: string }>>()

    const ids = (restaurantIds ?? []).map((r) => r.id)
    if (ids.length === 0) return false

    const { data: restRow } = await admin
        .from('restaurant_users')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'manager')
        .eq('active', true)
        .in('restaurant_id', ids)
        .limit(1)
        .maybeSingle<{ id: string }>()

    return Boolean(restRow)
}

/**
 * COUNT de staff ativos em uma unidade específica.
 * Usado no enforcement de plan.max_staff_per_unit.
 */
export async function countStaff(
    admin: SupabaseClient,
    restaurantId: string
): Promise<number> {
    const { count, error } = await admin
        .from('restaurant_users')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('role', 'staff')
        .eq('active', true)

    if (error) throw error
    return count ?? 0
}
