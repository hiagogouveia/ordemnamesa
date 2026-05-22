"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAccountSessionStore } from "@/lib/store/account-session-store"
import type { BillingCycle, PlanCode } from "@/lib/billing/types"

interface ChangePlanInput {
    plan_code: PlanCode
    cycle: BillingCycle
}

/**
 * Troca de plano/ciclo de uma assinatura ativa (Stripe-native via subscriptions.update).
 * O banco atualiza via webhook; aqui invalidamos o billing-status para refletir em seguida.
 */
export function useChangePlan() {
    const accountId = useAccountSessionStore((s) => s.accountId)
    const qc = useQueryClient()

    return useMutation<void, Error, ChangePlanInput>({
        mutationFn: async ({ plan_code, cycle }) => {
            const supabase = createClient()
            const {
                data: { session },
            } = await supabase.auth.getSession()
            if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.")

            const res = await fetch("/api/stripe/change-plan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ plan_code, cycle, account_id: accountId ?? undefined }),
            })
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
            if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível trocar de plano.")
        },
        onSuccess: () => {
            // Webhook é assíncrono; revalida após um curto intervalo.
            setTimeout(() => qc.invalidateQueries({ queryKey: ["billing-status"] }), 1500)
        },
    })
}
