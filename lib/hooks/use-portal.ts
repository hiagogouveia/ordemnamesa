"use client"

import { useMutation } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAccountSessionStore } from "@/lib/store/account-session-store"

/**
 * Abre o Stripe Billing Portal. Em sucesso, redireciona para a página
 * hospedada do Stripe (gerenciar assinatura/cartão/invoices).
 */
export function usePortal() {
    const accountId = useAccountSessionStore((s) => s.accountId)

    return useMutation<void, Error, void>({
        mutationFn: async () => {
            const supabase = createClient()
            const {
                data: { session },
            } = await supabase.auth.getSession()
            if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.")

            const res = await fetch("/api/stripe/portal", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ account_id: accountId ?? undefined }),
            })
            const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
            if (!res.ok || !data.url) throw new Error(data.error ?? "Não foi possível abrir o portal.")
            window.location.href = data.url
        },
    })
}
