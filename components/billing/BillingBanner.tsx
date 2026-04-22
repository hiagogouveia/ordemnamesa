"use client"

import { useBilling } from "@/lib/hooks/use-billing"

export function BillingBanner() {
    const { data: billing } = useBilling()

    if (!billing) return null

    const { status } = billing.subscription
    const days = billing.days_until_expiration

    if (status === "active") return null

    if (status === "trial") {
        const urgent = days !== null && days <= 7
        return (
            <div className={`flex items-center justify-center gap-3 border-b px-4 py-2.5 text-sm ${urgent ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "bg-[#13b6ec]/10 border-[#13b6ec]/20 text-[#13b6ec]"}`}>
                <span className="material-symbols-outlined text-[18px] shrink-0">
                    {urgent ? "warning" : "info"}
                </span>
                <span>
                    {days !== null
                        ? `Você está no período de teste. ${urgent ? `⚠️ Restam apenas ${days} dias.` : `Restam ${days} dias.`}`
                        : "Você está no período de teste."}
                </span>
                <a
                    href="/configuracoes?tab=plano"
                    className="underline underline-offset-2 hover:opacity-80 font-medium whitespace-nowrap"
                >
                    Ver plano
                </a>
            </div>
        )
    }

    if (status === "past_due") {
        return (
            <div className="flex items-center justify-center gap-3 bg-red-500/10 border-b border-red-500/30 px-4 py-2.5 text-sm text-red-400">
                <span className="material-symbols-outlined text-[18px] shrink-0">warning</span>
                <span>Seu plano expirou. Entre em contato para continuar usando o sistema.</span>
                <a
                    href="https://wa.me/5567991364767?text=Olá, preciso renovar meu plano no Ordem na Mesa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:opacity-80 font-medium whitespace-nowrap"
                >
                    Falar com suporte
                </a>
            </div>
        )
    }

    if (status === "canceled") {
        return (
            <div className="flex items-center justify-center gap-3 bg-red-500/10 border-b border-red-500/30 px-4 py-2.5 text-sm text-red-400">
                <span className="material-symbols-outlined text-[18px] shrink-0">block</span>
                <span>Sua conta está desativada. Você pode visualizar os dados históricos, mas novas ações estão bloqueadas.</span>
                <a
                    href="https://wa.me/5567991364767?text=Olá, quero reativar minha conta no Ordem na Mesa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:opacity-80 font-medium whitespace-nowrap"
                >
                    Reativar
                </a>
            </div>
        )
    }

    return null
}
