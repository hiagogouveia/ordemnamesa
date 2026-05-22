"use client"

import { useMutation } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAccountSessionStore } from "@/lib/store/account-session-store"
import type { BillingCycle, PlanCode } from "@/lib/billing/types"

interface CheckoutInput {
    plan_code: PlanCode
    cycle: BillingCycle
}

/**
 * Inicia o Stripe Checkout. O client envia APENAS plan_code + cycle.
 * price_id e account_id são resolvidos server-side em /api/stripe/checkout.
 * Em sucesso, redireciona para a página hospedada do Stripe.
 */
export function useCheckout() {
    const accountId = useAccountSessionStore((s) => s.accountId)

    return useMutation<void, Error, CheckoutInput>({
        mutationFn: async ({ plan_code, cycle }) => {
            const supabase = createClient()
            const {
                data: { session },
            } = await supabase.auth.getSession()
            if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.")

            const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ plan_code, cycle, account_id: accountId ?? undefined }),
            })

            const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
            if (!res.ok || !data.url) {
                throw new Error(data.error ?? "Não foi possível iniciar o checkout.")
            }
            // Redireciona para o Stripe Checkout hospedado.
            window.location.href = data.url
        },
    })
}
