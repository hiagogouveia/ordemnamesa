import type { SupabaseClient } from '@supabase/supabase-js'
import type {
    AccessCheck,
    AccountBilling,
    Plan,
    Subscription,
    SubscriptionStatus,
} from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

interface SubscriptionRow {
    id: string
    account_id: string
    plan_id: string
    billing_cycle: 'monthly' | 'yearly'
    status: SubscriptionStatus
    started_at: string
    ends_at: string | null
    canceled_at: string | null
    grace_period_days: number | null
    block_task_exec_on_past_due: boolean
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    plans: {
        id: string
        code: 'A' | 'B' | 'C' | 'D'
        name: string
        max_units: number
        max_managers: number
        max_staff_per_unit: number
        price_monthly_cents: number
        price_yearly_cents: number
        stripe_price_id_monthly: string | null
        stripe_price_id_yearly: string | null
        active: boolean
    } | null
}

/**
 * Carrega a subscription "viva" (trial|active|past_due) + plan da account,
 * caindo para a última subscription registrada se não houver viva (cobre
 * canceled/unpaid/incomplete).
 *
 * Retorna null apenas se a account não tem nenhuma subscription — estado
 * anômalo (backfill deveria garantir que não acontece). Consumidores devem
 * tratar esse null como `no_subscription`.
 */
export async function getAccountBilling(
    admin: SupabaseClient,
    accountId: string
): Promise<AccountBilling | null> {
    // Prioriza subscription viva; fallback para a mais recente de qualquer status
    const liveStatuses: SubscriptionStatus[] = ['trial', 'active', 'past_due']

    const { data: live } = await admin
        .from('subscriptions')
        .select(`
            id, account_id, plan_id, billing_cycle, status, started_at, ends_at,
            canceled_at, grace_period_days, block_task_exec_on_past_due,
            stripe_customer_id, stripe_subscription_id,
            plans:plan_id (
                id, code, name, max_units, max_managers, max_staff_per_unit,
                price_monthly_cents, price_yearly_cents,
                stripe_price_id_monthly, stripe_price_id_yearly, active
            )
        `)
        .eq('account_id', accountId)
        .in('status', liveStatuses)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle<SubscriptionRow>()

    let row = live

    if (!row) {
        const { data: fallback } = await admin
            .from('subscriptions')
            .select(`
                id, account_id, plan_id, billing_cycle, status, started_at, ends_at,
                canceled_at, grace_period_days, block_task_exec_on_past_due,
                stripe_customer_id, stripe_subscription_id,
                plans:plan_id (
                    id, code, name, max_units, max_managers, max_staff_per_unit,
                    price_monthly_cents, price_yearly_cents,
                    stripe_price_id_monthly, stripe_price_id_yearly, active
                )
            `)
            .eq('account_id', accountId)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle<SubscriptionRow>()
        row = fallback
    }

    if (!row || !row.plans) return null

    const subscription: Subscription = {
        id: row.id,
        account_id: row.account_id,
        plan_id: row.plan_id,
        billing_cycle: row.billing_cycle,
        status: row.status,
        started_at: row.started_at,
        ends_at: row.ends_at,
        canceled_at: row.canceled_at,
        grace_period_days: row.grace_period_days,
        block_task_exec_on_past_due: row.block_task_exec_on_past_due,
        stripe_customer_id: row.stripe_customer_id,
        stripe_subscription_id: row.stripe_subscription_id,
    }

    const plan: Plan = {
        id: row.plans.id,
        code: row.plans.code,
        name: row.plans.name,
        max_units: row.plans.max_units,
        max_managers: row.plans.max_managers,
        max_staff_per_unit: row.plans.max_staff_per_unit,
        price_monthly_cents: row.plans.price_monthly_cents,
        price_yearly_cents: row.plans.price_yearly_cents,
        stripe_price_id_monthly: row.plans.stripe_price_id_monthly,
        stripe_price_id_yearly: row.plans.stripe_price_id_yearly,
        active: row.plans.active,
    }

    const now = Date.now()
    const endsAtMs = subscription.ends_at ? Date.parse(subscription.ends_at) : null
    const days_until_expiration =
        endsAtMs === null ? null : Math.ceil((endsAtMs - now) / MS_PER_DAY)
    const is_expired = endsAtMs !== null && endsAtMs < now

    return { subscription, plan, days_until_expiration, is_expired }
}

/** Subscription em trial e ainda dentro do prazo. */
export function isTrialActive(sub: Subscription): boolean {
    if (sub.status !== 'trial') return false
    if (!sub.ends_at) return true
    return Date.parse(sub.ends_at) > Date.now()
}

/** Subscription em past_due (inadimplente mas ainda no grace do negócio). */
export function isPastDue(sub: Subscription): boolean {
    return sub.status === 'past_due'
}

/**
 * Permite acesso ao app (leitura)?
 *
 * Sempre libera quando existe billing, independente do status. canceled
 * também libera porque cliente cancelado precisa ver histórico para
 * justificar re-conversão. Bloqueia apenas se a account não tem billing
 * (estado anômalo — defesa do backfill).
 */
export function canAccessApp(billing: AccountBilling | null): AccessCheck {
    if (!billing) return { allowed: false, reason: 'no_subscription' }
    return { allowed: true }
}

/**
 * Permite criar recursos (checklists, units, members, areas, shifts, roles)?
 *
 * Permite: trial, active.
 * Bloqueia: past_due, canceled, incomplete, unpaid, ausência de billing.
 */
export function canCreateResources(billing: AccountBilling | null): AccessCheck {
    if (!billing) return { allowed: false, reason: 'no_subscription' }
    const { status } = billing.subscription

    if (status === 'trial' || status === 'active') return { allowed: true }
    if (status === 'canceled') return { allowed: false, reason: 'canceled' }
    if (status === 'past_due') return { allowed: false, reason: 'past_due_blocks_writes' }
    // incomplete / unpaid também bloqueiam criação
    return { allowed: false, reason: 'unknown_status' }
}

/**
 * Permite executar tarefas (assume, complete)?
 *
 * Permite: trial, active.
 * Bloqueia: canceled, incomplete, unpaid, ausência de billing.
 * past_due: depende da flag block_task_exec_on_past_due (default false →
 * permite continuar operando mesmo em atraso, reduz churn).
 */
export function canExecuteTasks(billing: AccountBilling | null): AccessCheck {
    if (!billing) return { allowed: false, reason: 'no_subscription' }
    const { status, block_task_exec_on_past_due } = billing.subscription

    if (status === 'trial' || status === 'active') return { allowed: true }
    if (status === 'canceled') return { allowed: false, reason: 'canceled' }
    if (status === 'past_due') {
        return block_task_exec_on_past_due
            ? { allowed: false, reason: 'past_due_blocks_execution' }
            : { allowed: true }
    }
    return { allowed: false, reason: 'unknown_status' }
}
