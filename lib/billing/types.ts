export type PlanCode = 'A' | 'B' | 'C' | 'D'

export type BillingCycle = 'monthly' | 'yearly'

export type SubscriptionStatus =
    | 'trial'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'incomplete'
    | 'unpaid'

export interface Plan {
    id: string
    code: PlanCode
    name: string
    max_units: number
    max_managers: number
    max_staff_per_unit: number
    price_monthly_cents: number
    price_yearly_cents: number
    stripe_price_id_monthly: string | null
    stripe_price_id_yearly: string | null
    active: boolean
}

export interface Subscription {
    id: string
    account_id: string
    plan_id: string
    billing_cycle: BillingCycle
    status: SubscriptionStatus
    started_at: string
    ends_at: string | null
    canceled_at: string | null
    grace_period_days: number | null
    block_task_exec_on_past_due: boolean
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
}

export interface AccountBilling {
    subscription: Subscription
    plan: Plan
    days_until_expiration: number | null
    is_expired: boolean
}

export type AccessReason =
    | 'no_subscription'
    | 'canceled'
    | 'past_due_blocks_writes'
    | 'past_due_blocks_execution'
    | 'limit_reached'
    | 'unknown_status'

export type LimitType = 'units' | 'managers' | 'staff_per_unit'

export interface AccessCheck {
    allowed: boolean
    reason?: AccessReason
    current?: number
    limit?: number
    limit_type?: LimitType
}
