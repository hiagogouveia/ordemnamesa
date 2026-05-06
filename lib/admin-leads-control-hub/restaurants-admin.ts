import { supabaseAdmin } from './supabase-admin'

export type SubscriptionStatus =
    | 'trial'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'incomplete'
    | 'unpaid'

export type AdminRestaurantStatus = 'active' | 'trial' | 'suspended'

export interface OwnerSummary {
    user_id: string
    name: string | null
    email: string | null
    phone: string | null
    last_sign_in_at: string | null
    confirmed: boolean
}

export interface PlanSummary {
    id: string
    code: string
    name: string
    price_monthly_cents: number
    price_yearly_cents: number
}

export interface BillingSummary {
    plan: PlanSummary | null
    subscription_status: SubscriptionStatus | null
    billing_cycle: 'monthly' | 'yearly' | null
    started_at: string | null
    ends_at: string | null
    canceled_at: string | null
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    trial_expired: boolean
}

export interface AccountSummary {
    id: string
    name: string
    active: boolean
    created_at: string
}

export interface RestaurantAdminListItem {
    id: string
    name: string
    slug: string
    cnpj: string | null
    phone: string | null
    active: boolean
    created_at: string
    is_primary: boolean
    account: AccountSummary
    owner: OwnerSummary | null
    billing: BillingSummary
    derived_status: AdminRestaurantStatus
    users_count: number
    checklists_count: number
}

export interface RestaurantAdminDetail extends RestaurantAdminListItem {
    executions_count: number
    sibling_restaurants: Array<{
        id: string
        name: string
        is_primary: boolean
        active: boolean
    }>
}

export interface AdminLogEntry {
    id: string
    admin_email: string
    action: string
    target_type: string | null
    target_id: string | null
    metadata: Record<string, unknown>
    created_at: string
}

interface RestaurantRow {
    id: string
    name: string
    slug: string
    cnpj: string | null
    phone: string | null
    active: boolean
    created_at: string
    is_primary: boolean
    deleted_at: string | null
    owner_id: string
    account_id: string
}

interface AccountRow {
    id: string
    name: string
    active: boolean
    created_at: string
    plan_id: string | null
}

interface SubscriptionRow {
    account_id: string
    plan_id: string
    billing_cycle: 'monthly' | 'yearly'
    status: SubscriptionStatus
    started_at: string
    ends_at: string | null
    canceled_at: string | null
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
}

interface PlanRow {
    id: string
    code: string
    name: string
    price_monthly_cents: number
    price_yearly_cents: number
}

interface UserRow {
    id: string
    email: string
    name: string | null
}

function deriveStatus(
    restaurantActive: boolean,
    accountActive: boolean,
    sub: SubscriptionRow | null
): AdminRestaurantStatus {
    if (!restaurantActive || !accountActive) return 'suspended'
    if (!sub) return 'suspended'
    if (sub.status === 'trial') return 'trial'
    if (sub.status === 'active') return 'active'
    return 'suspended'
}

function isTrialExpired(sub: SubscriptionRow | null): boolean {
    if (!sub || sub.status !== 'trial') return false
    if (!sub.ends_at) return false
    return new Date(sub.ends_at).getTime() < Date.now()
}

export interface ListRestaurantsArgs {
    search?: string
    plan?: string
    status?: AdminRestaurantStatus | 'all'
    trialExpired?: boolean
    page?: number
    perPage?: number
}

export interface ListRestaurantsResult {
    items: RestaurantAdminListItem[]
    total: number
    page: number
    perPage: number
}

export async function listRestaurantsAdmin(
    args: ListRestaurantsArgs = {}
): Promise<ListRestaurantsResult> {
    const page = Math.max(1, args.page ?? 1)
    const perPage = Math.min(100, Math.max(5, args.perPage ?? 25))

    let q = supabaseAdmin
        .from('restaurants')
        .select(
            'id, name, slug, cnpj, phone, active, created_at, is_primary, deleted_at, owner_id, account_id',
            { count: 'exact' }
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    if (args.search && args.search.trim()) {
        const term = args.search.trim()
        q = q.or(`name.ilike.%${term}%,slug.ilike.%${term}%,cnpj.ilike.%${term}%`)
    }

    q = q.range((page - 1) * perPage, page * perPage - 1)

    const { data: restaurantsRaw, error, count } = await q
    if (error) throw new Error(`Falha ao listar restaurantes: ${error.message}`)
    const restaurants = (restaurantsRaw ?? []) as RestaurantRow[]
    if (restaurants.length === 0) {
        return { items: [], total: count ?? 0, page, perPage }
    }

    const accountIds = Array.from(new Set(restaurants.map((r) => r.account_id)))
    const restaurantIds = restaurants.map((r) => r.id)
    const ownerIds = Array.from(new Set(restaurants.map((r) => r.owner_id)))

    const [accountsResp, subsResp, plansResp, usersResp, checklistsResp, restaurantUsersResp] =
        await Promise.all([
            supabaseAdmin
                .from('accounts')
                .select('id, name, active, created_at, plan_id')
                .in('id', accountIds),
            supabaseAdmin
                .from('subscriptions')
                .select(
                    'account_id, plan_id, billing_cycle, status, started_at, ends_at, canceled_at, stripe_customer_id, stripe_subscription_id'
                )
                .in('account_id', accountIds),
            supabaseAdmin.from('plans').select('id, code, name, price_monthly_cents, price_yearly_cents'),
            supabaseAdmin.from('users').select('id, email, name').in('id', ownerIds),
            supabaseAdmin
                .from('checklists')
                .select('restaurant_id')
                .in('restaurant_id', restaurantIds),
            supabaseAdmin
                .from('restaurant_users')
                .select('restaurant_id, user_id')
                .in('restaurant_id', restaurantIds),
        ])

    const accounts = (accountsResp.data ?? []) as AccountRow[]
    const subs = (subsResp.data ?? []) as SubscriptionRow[]
    const plans = (plansResp.data ?? []) as PlanRow[]
    const users = (usersResp.data ?? []) as UserRow[]
    const checklists = (checklistsResp.data ?? []) as Array<{ restaurant_id: string }>
    const ru = (restaurantUsersResp.data ?? []) as Array<{ restaurant_id: string; user_id: string }>

    const accountMap = new Map(accounts.map((a) => [a.id, a]))
    const subMap = new Map(subs.map((s) => [s.account_id, s]))
    const planMap = new Map(plans.map((p) => [p.id, p]))
    const userMap = new Map(users.map((u) => [u.id, u]))

    const checklistsCountMap = new Map<string, number>()
    for (const c of checklists) {
        checklistsCountMap.set(c.restaurant_id, (checklistsCountMap.get(c.restaurant_id) ?? 0) + 1)
    }
    const usersByRestaurant = new Map<string, Set<string>>()
    for (const r of ru) {
        let set = usersByRestaurant.get(r.restaurant_id)
        if (!set) {
            set = new Set()
            usersByRestaurant.set(r.restaurant_id, set)
        }
        set.add(r.user_id)
    }

    let items: RestaurantAdminListItem[] = restaurants.map((r) => {
        const account = accountMap.get(r.account_id)
        const sub = subMap.get(r.account_id) ?? null
        const subPlan = sub ? planMap.get(sub.plan_id) ?? null : null
        const accountPlan =
            !subPlan && account?.plan_id ? planMap.get(account.plan_id) ?? null : null
        const plan = subPlan ?? accountPlan
        const userRow = userMap.get(r.owner_id)
        return {
            id: r.id,
            name: r.name,
            slug: r.slug,
            cnpj: r.cnpj,
            phone: r.phone,
            active: r.active,
            created_at: r.created_at,
            is_primary: r.is_primary,
            account: {
                id: r.account_id,
                name: account?.name ?? '—',
                active: account?.active ?? false,
                created_at: account?.created_at ?? r.created_at,
            },
            owner: userRow
                ? {
                      user_id: userRow.id,
                      name: userRow.name,
                      email: userRow.email,
                      phone: null,
                      last_sign_in_at: null,
                      confirmed: true,
                  }
                : null,
            billing: {
                plan: plan
                    ? {
                          id: plan.id,
                          code: plan.code,
                          name: plan.name,
                          price_monthly_cents: plan.price_monthly_cents,
                          price_yearly_cents: plan.price_yearly_cents,
                      }
                    : null,
                subscription_status: sub?.status ?? null,
                billing_cycle: sub?.billing_cycle ?? null,
                started_at: sub?.started_at ?? null,
                ends_at: sub?.ends_at ?? null,
                canceled_at: sub?.canceled_at ?? null,
                stripe_customer_id: sub?.stripe_customer_id ?? null,
                stripe_subscription_id: sub?.stripe_subscription_id ?? null,
                trial_expired: isTrialExpired(sub),
            },
            derived_status: deriveStatus(r.active, account?.active ?? false, sub),
            users_count: usersByRestaurant.get(r.id)?.size ?? 0,
            checklists_count: checklistsCountMap.get(r.id) ?? 0,
        }
    })

    if (args.plan && args.plan !== 'all') {
        items = items.filter((i) => i.billing.plan?.code === args.plan)
    }
    if (args.status && args.status !== 'all') {
        items = items.filter((i) => i.derived_status === args.status)
    }
    if (args.trialExpired) {
        items = items.filter((i) => i.billing.trial_expired)
    }
    if (args.search && args.search.trim()) {
        const term = args.search.trim().toLowerCase()
        items = items.filter(
            (i) =>
                i.name.toLowerCase().includes(term) ||
                (i.account.name ?? '').toLowerCase().includes(term) ||
                (i.cnpj ?? '').toLowerCase().includes(term) ||
                (i.owner?.email ?? '').toLowerCase().includes(term) ||
                (i.owner?.name ?? '').toLowerCase().includes(term)
        )
    }

    return { items, total: count ?? items.length, page, perPage }
}

export async function getRestaurantAdminDetail(
    id: string
): Promise<RestaurantAdminDetail | null> {
    const { data: restaurantRaw } = await supabaseAdmin
        .from('restaurants')
        .select(
            'id, name, slug, cnpj, phone, active, created_at, is_primary, deleted_at, owner_id, account_id'
        )
        .eq('id', id)
        .maybeSingle<RestaurantRow>()
    if (!restaurantRaw) return null
    const restaurant = restaurantRaw

    const [accountResp, subResp, plansResp, ownerResp, siblingsResp, checklistsResp, ruResp, executionsResp] =
        await Promise.all([
            supabaseAdmin
                .from('accounts')
                .select('id, name, active, created_at, plan_id')
                .eq('id', restaurant.account_id)
                .maybeSingle<AccountRow>(),
            supabaseAdmin
                .from('subscriptions')
                .select(
                    'account_id, plan_id, billing_cycle, status, started_at, ends_at, canceled_at, stripe_customer_id, stripe_subscription_id'
                )
                .eq('account_id', restaurant.account_id)
                .maybeSingle<SubscriptionRow>(),
            supabaseAdmin.from('plans').select('id, code, name, price_monthly_cents, price_yearly_cents'),
            supabaseAdmin
                .from('users')
                .select('id, email, name')
                .eq('id', restaurant.owner_id)
                .maybeSingle<UserRow>(),
            supabaseAdmin
                .from('restaurants')
                .select('id, name, is_primary, active')
                .eq('account_id', restaurant.account_id)
                .is('deleted_at', null)
                .neq('id', restaurant.id),
            supabaseAdmin
                .from('checklists')
                .select('id', { count: 'exact', head: true })
                .eq('restaurant_id', restaurant.id),
            supabaseAdmin
                .from('restaurant_users')
                .select('user_id')
                .eq('restaurant_id', restaurant.id),
            supabaseAdmin
                .from('checklist_assumptions')
                .select('id', { count: 'exact', head: true })
                .eq('restaurant_id', restaurant.id),
        ])

    const account = accountResp.data
    const sub = subResp.data
    const plans = (plansResp.data ?? []) as PlanRow[]
    const userRow = ownerResp.data
    const siblings = (siblingsResp.data ?? []) as Array<{
        id: string
        name: string
        is_primary: boolean
        active: boolean
    }>
    const ruRows = (ruResp.data ?? []) as Array<{ user_id: string }>

    const planMap = new Map(plans.map((p) => [p.id, p]))
    const subPlan = sub ? planMap.get(sub.plan_id) ?? null : null
    const accountPlan = !subPlan && account?.plan_id ? planMap.get(account.plan_id) ?? null : null
    const plan = subPlan ?? accountPlan

    let ownerSummary: OwnerSummary | null = null
    if (userRow) {
        let lastSignIn: string | null = null
        let confirmed = true
        try {
            const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(userRow.id)
            const u = authRes?.user
            lastSignIn = u?.last_sign_in_at ?? null
            confirmed = !!u?.email_confirmed_at
        } catch {
            /* ignore */
        }
        ownerSummary = {
            user_id: userRow.id,
            name: userRow.name,
            email: userRow.email,
            phone: restaurant.phone,
            last_sign_in_at: lastSignIn,
            confirmed,
        }
    }

    return {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        cnpj: restaurant.cnpj,
        phone: restaurant.phone,
        active: restaurant.active,
        created_at: restaurant.created_at,
        is_primary: restaurant.is_primary,
        account: {
            id: restaurant.account_id,
            name: account?.name ?? '—',
            active: account?.active ?? false,
            created_at: account?.created_at ?? restaurant.created_at,
        },
        owner: ownerSummary,
        billing: {
            plan: plan
                ? {
                      id: plan.id,
                      code: plan.code,
                      name: plan.name,
                      price_monthly_cents: plan.price_monthly_cents,
                      price_yearly_cents: plan.price_yearly_cents,
                  }
                : null,
            subscription_status: sub?.status ?? null,
            billing_cycle: sub?.billing_cycle ?? null,
            started_at: sub?.started_at ?? null,
            ends_at: sub?.ends_at ?? null,
            canceled_at: sub?.canceled_at ?? null,
            stripe_customer_id: sub?.stripe_customer_id ?? null,
            stripe_subscription_id: sub?.stripe_subscription_id ?? null,
            trial_expired: isTrialExpired(sub ?? null),
        },
        derived_status: deriveStatus(restaurant.active, account?.active ?? false, sub ?? null),
        users_count: new Set(ruRows.map((r) => r.user_id)).size,
        checklists_count: checklistsResp.count ?? 0,
        executions_count: executionsResp.count ?? 0,
        sibling_restaurants: siblings,
    }
}

export async function getAdminLogsForRestaurant(
    detail: RestaurantAdminDetail,
    limit = 30
): Promise<AdminLogEntry[]> {
    const targetIds: string[] = [detail.id, detail.account.id]
    if (detail.owner) targetIds.push(detail.owner.user_id)

    const { data, error } = await supabaseAdmin
        .from('admin_logs')
        .select('id, admin_email, action, target_type, target_id, metadata, created_at')
        .in('target_id', targetIds)
        .order('created_at', { ascending: false })
        .limit(limit)
    if (error) return []
    return (data ?? []) as AdminLogEntry[]
}

export async function listPlansForFilter(): Promise<PlanSummary[]> {
    const { data } = await supabaseAdmin
        .from('plans')
        .select('id, code, name, price_monthly_cents, price_yearly_cents')
        .eq('active', true)
        .order('code', { ascending: true })
    return (data ?? []) as PlanSummary[]
}
