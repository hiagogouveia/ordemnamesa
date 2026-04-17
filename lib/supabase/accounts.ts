import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Retorna o account_id do restaurant informado, ou null se não encontrado.
 * Usa o client recebido: a RLS é aplicada conforme a sessão do caller.
 */
export async function getAccountIdForRestaurant(
    supabase: SupabaseClient,
    restaurantId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from('restaurants')
        .select('account_id')
        .eq('id', restaurantId)
        .maybeSingle<{ account_id: string | null }>()

    if (error || !data?.account_id) return null
    return data.account_id
}

/**
 * Lista os account_ids aos quais o usuário tem vínculo ativo em `account_users`.
 */
export async function listUserAccountIds(
    supabase: SupabaseClient,
    userId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from('account_users')
        .select('account_id')
        .eq('user_id', userId)
        .eq('active', true)

    if (error || !data) return []
    return (data as Array<{ account_id: string }>).map((row) => row.account_id)
}

export interface AccountUnit {
    id: string
    name: string
}

/**
 * Lista as unidades (restaurants ativos) de uma account.
 * Usado no modo global para resolver o escopo server-side sem confiar
 * em nenhum restaurant_id vindo do frontend.
 */
export async function listAccountUnits(
    supabase: SupabaseClient,
    accountId: string
): Promise<AccountUnit[]> {
    const { data, error } = await supabase
        .from('restaurants')
        .select('id, name')
        .eq('account_id', accountId)
        .eq('active', true)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .returns<AccountUnit[]>()

    if (error || !data) return []
    return data
}

/**
 * Decide se o usuário pode usar a Visão Global na account informada.
 * Regras (Fase 4):
 *   - usuário tem vínculo ativo em account_users com role in ('owner','manager')
 *   - a account tem >= 2 unidades ativas (senão não faz sentido agregar)
 *
 * Retorna também a lista de unidades para evitar round-trip duplicado.
 */
export async function canUseGlobal(
    supabase: SupabaseClient,
    accountId: string,
    userId: string
): Promise<{ allowed: boolean; units: AccountUnit[] }> {
    const [{ data: membership }, units] = await Promise.all([
        supabase
            .from('account_users')
            .select('role, can_view_global')
            .eq('account_id', accountId)
            .eq('user_id', userId)
            .eq('active', true)
            .maybeSingle<{ role: 'owner' | 'manager'; can_view_global: boolean }>(),
        listAccountUnits(supabase, accountId),
    ])

    const isOwner = membership?.role === 'owner'
    const isManagerWithPermission = membership?.role === 'manager' && membership.can_view_global === true
    return {
        allowed: (isOwner || isManagerWithPermission) && units.length >= 2,
        units,
    }
}
