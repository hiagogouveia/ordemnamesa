"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAccountSessionStore } from "@/lib/store/account-session-store"

export interface BillingPlan {
    id: string
    code: "A" | "B" | "C" | "D"
    name: string
    max_units: number
    max_managers: number
    max_staff_per_unit: number
    price_monthly_cents: number
    price_yearly_cents: number
}

export interface BillingSubscription {
    id: string
    status: "trial" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid"
    billing_cycle: "monthly" | "yearly"
    started_at: string
    ends_at: string | null
    canceled_at: string | null
}

export interface BillingStatus {
    account_id: string
    subscription: BillingSubscription
    plan: BillingPlan
    days_until_expiration: number | null
    is_expired: boolean
    access: {
        can_access_app: boolean
        can_create_resources: boolean
        can_execute_tasks: boolean
    }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`
    }
    return headers
}

export function useBilling() {
    const accountId = useAccountSessionStore((s) => s.accountId)

    return useQuery<BillingStatus>({
        queryKey: ["billing-status", accountId],
        queryFn: async () => {
            const headers = await getAuthHeaders()
            const url = accountId
                ? `/api/billing/status?account_id=${accountId}`
                : "/api/billing/status"
            const res = await fetch(url, { headers })
            if (!res.ok) throw new Error("Erro ao carregar status do plano")
            return res.json() as Promise<BillingStatus>
        },
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: false,
    })
}
