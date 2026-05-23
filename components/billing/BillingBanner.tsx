"use client"

import { useBilling } from "@/lib/hooks/use-billing"

export function BillingBanner() {
    const { data: billing } = useBilling()

    if (!billing) return null

    const { status } = billing.subscription
    const days = billing.days_until_expiration

    if (status === "active") return null

    if (status === "trial") {
        // 3 níveis de urgência sem sair da paleta amber/info — sem vermelho/alarmismo.
        const level: "info" | "soft" | "strong" =
            days === null || days >= 8 ? "info" : days >= 4 ? "soft" : "strong"

        const styles = {
            info: {
                wrap: "bg-[#13b6ec]/10 border-[#13b6ec]/20 text-[#13b6ec]",
                cta: "bg-[#13b6ec]/20 hover:bg-[#13b6ec]/30 text-white",
            },
            soft: {
                wrap: "bg-amber-500/10 border-amber-500/25 text-amber-200",
                cta: "bg-amber-500/20 hover:bg-amber-500/30 text-amber-50",
            },
            strong: {
                wrap: "bg-amber-500/20 border-amber-500/40 text-amber-100 font-medium",
                cta: "bg-amber-400/30 hover:bg-amber-400/40 text-amber-50",
            },
        }[level]

        const icon = level === "info" ? "info" : "schedule"
        const remaining =
            days === null ? null : days <= 0 ? "hoje" : days === 1 ? "em 1 dia" : `em ${days} dias`

        const message = remaining
            ? level === "strong"
                ? `Seu período gratuito termina ${remaining}. Assine um plano agora para não interromper o uso.`
                : level === "soft"
                  ? `Seu período gratuito termina ${remaining}. Para continuar usando o Ordem na Mesa, escolha um plano antes do vencimento.`
                  : `Seu período gratuito termina ${remaining}. Escolha um plano para garantir a continuidade do acesso.`
            : "Você está no período gratuito. Escolha um plano para garantir a continuidade do acesso."

        return (
            <div className={`flex items-center justify-center flex-wrap gap-x-3 gap-y-1.5 border-b px-4 py-2.5 text-sm ${styles.wrap}`}>
                <span className="material-symbols-outlined text-[18px] shrink-0">{icon}</span>
                <span>{message}</span>
                <a
                    href="/configuracoes?tab=plano"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${styles.cta}`}
                >
                    Ver planos
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
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
