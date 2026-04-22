import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts'
import {
    countManagers,
    countStaff,
    countUnits,
    isUserManagerInAccount,
} from './queries'
import { canCreateResources, getAccountBilling } from './subscription-access'
import type { AccessCheck } from './types'

/**
 * Verifica se é possível criar mais 1 unidade (restaurant) na account.
 *
 * Regra: estado da subscription deve permitir criação (canCreateResources)
 * e count atual deve ser < plan.max_units.
 */
export async function canCreateUnit(
    admin: SupabaseClient,
    accountId: string
): Promise<AccessCheck> {
    const billing = await getAccountBilling(admin, accountId)
    const stateCheck = canCreateResources(billing)
    if (!stateCheck.allowed || !billing) return stateCheck

    const current = await countUnits(admin, accountId)
    const limit = billing.plan.max_units
    if (current >= limit) {
        return { allowed: false, reason: 'limit_reached', current, limit, limit_type: 'units' }
    }
    return { allowed: true }
}

/**
 * Verifica se é possível adicionar mais 1 manager na account.
 *
 * Contagem é DISTINCT user_id em account_users ∪ restaurant_users com
 * role='manager' ativo — ver countManagers.
 *
 * Se opts.userIdBeingAdded é informado e esse user JÁ é manager em algum
 * lugar da account, a operação é liberada sem validar cota (promover o
 * mesmo user a manager numa segunda unidade não aumenta o DISTINCT).
 */
export async function canAddManager(
    admin: SupabaseClient,
    accountId: string,
    opts?: { userIdBeingAdded?: string }
): Promise<AccessCheck> {
    const billing = await getAccountBilling(admin, accountId)
    const stateCheck = canCreateResources(billing)
    if (!stateCheck.allowed || !billing) return stateCheck

    if (opts?.userIdBeingAdded) {
        const alreadyCounted = await isUserManagerInAccount(
            admin,
            accountId,
            opts.userIdBeingAdded
        )
        if (alreadyCounted) return { allowed: true }
    }

    const current = await countManagers(admin, accountId)
    const limit = billing.plan.max_managers
    if (current >= limit) {
        return { allowed: false, reason: 'limit_reached', current, limit, limit_type: 'managers' }
    }
    return { allowed: true }
}

/**
 * Verifica se é possível adicionar mais 1 staff na unidade específica.
 *
 * Resolve account_id internamente via getAccountIdForRestaurant.
 */
export async function canAddStaff(
    admin: SupabaseClient,
    restaurantId: string
): Promise<AccessCheck> {
    const accountId = await getAccountIdForRestaurant(admin, restaurantId)
    if (!accountId) return { allowed: false, reason: 'no_subscription' }

    const billing = await getAccountBilling(admin, accountId)
    const stateCheck = canCreateResources(billing)
    if (!stateCheck.allowed || !billing) return stateCheck

    const current = await countStaff(admin, restaurantId)
    const limit = billing.plan.max_staff_per_unit
    if (current >= limit) {
        return { allowed: false, reason: 'limit_reached', current, limit, limit_type: 'staff_per_unit' }
    }
    return { allowed: true }
}
