"use client"

import { useBilling } from "@/lib/hooks/use-billing"
import { useAccountSessionStore } from "@/lib/store/account-session-store"
import { useAccountUnits } from "@/lib/hooks/use-account-units"

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    trial: { label: "Período de teste", color: "text-[#13b6ec] bg-[#13b6ec]/10 border-[#13b6ec]/20" },
    active: { label: "Ativo", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    past_due: { label: "Expirado", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
    canceled: { label: "Cancelado", color: "text-red-400 bg-red-400/10 border-red-400/20" },
    incomplete: { label: "Incompleto", color: "text-[#92bbc9] bg-[#1a2c32] border-[#233f48]" },
    unpaid: { label: "Não pago", color: "text-red-400 bg-red-400/10 border-red-400/20" },
}

const PLAN_FEATURES: Record<string, string[]> = {
    A: ["1 unidade", "1 gestor", "Até 6 operadores por unidade"],
    B: ["2 unidades", "2 gestores", "Até 12 operadores por unidade"],
    C: ["4 unidades", "3 gestores", "Até 20 operadores por unidade"],
    D: ["6 unidades", "5 gestores", "Até 35 operadores por unidade"],
}

function formatCents(cents: number) {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string | null) {
    if (!iso) return "—"
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

interface LimitCardProps {
    icon: string
    label: string
    used: number | null
    limit: number
    unit: string
}

function LimitCard({ icon, label, used, limit, unit }: LimitCardProps) {
    const pct = used !== null ? Math.min((used / limit) * 100, 100) : null
    const almostFull = pct !== null && pct >= 80

    return (
        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#13b6ec] text-[20px]">{icon}</span>
                <span className="text-sm font-medium text-[#92bbc9]">{label}</span>
            </div>
            <div className="flex items-end justify-between">
                <div>
                    {used !== null ? (
                        <span className={`text-2xl font-bold ${almostFull ? "text-amber-400" : "text-white"}`}>
                            {used}
                            <span className="text-sm font-normal text-[#92bbc9] ml-1">/ {limit}</span>
                        </span>
                    ) : (
                        <span className="text-2xl font-bold text-white">
                            —
                            <span className="text-sm font-normal text-[#92bbc9] ml-1">/ {limit}</span>
                        </span>
                    )}
                    <p className="text-xs text-[#92bbc9] mt-0.5">{unit}</p>
                </div>
            </div>
            {pct !== null && (
                <div className="w-full h-1.5 bg-[#233f48] rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${almostFull ? "bg-amber-400" : "bg-[#13b6ec]"}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}
        </div>
    )
}

export function PlanoTab() {
    const { data: billing, isLoading } = useBilling()
    const accountId = useAccountSessionStore((s) => s.accountId)
    const { data: units = [] } = useAccountUnits(accountId)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <div className="w-8 h-8 rounded-full border-2 border-[#13b6ec] border-t-transparent animate-spin" />
            </div>
        )
    }

    if (!billing) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
                <span className="material-symbols-outlined text-[#325a67] text-5xl">workspace_premium</span>
                <p className="text-[#92bbc9] text-sm">Não foi possível carregar o plano.</p>
            </div>
        )
    }

    const { subscription, plan, days_until_expiration } = billing
    const statusInfo = STATUS_LABEL[subscription.status] ?? STATUS_LABEL.incomplete
    const features = PLAN_FEATURES[plan.code] ?? []
    const unitCount = units.length

    return (
        <div className="flex flex-col gap-6 max-w-2xl">
            {/* Header do plano */}
            <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-[#13b6ec] text-[22px]">workspace_premium</span>
                            <h3 className="text-xl font-bold text-white font-fraunces">{plan.name}</h3>
                        </div>
                        <p className="text-sm text-[#92bbc9]">
                            {formatCents(plan.price_monthly_cents)}/mês
                            {plan.price_yearly_cents < plan.price_monthly_cents && (
                                <span className="ml-2 text-emerald-400">
                                    ou {formatCents(plan.price_yearly_cents)}/mês no plano anual
                                </span>
                            )}
                        </p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${statusInfo.color}`}>
                        {statusInfo.label}
                    </span>
                </div>

                {/* Trial countdown */}
                {subscription.status === "trial" && days_until_expiration !== null && (
                    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border text-sm ${days_until_expiration <= 7 ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-[#13b6ec]/10 border-[#13b6ec]/20 text-[#13b6ec]"}`}>
                        <span className="material-symbols-outlined text-[18px]">schedule</span>
                        <span>
                            Período de teste termina em <strong>{formatDate(subscription.ends_at)}</strong>
                            {" "}— restam <strong>{days_until_expiration} dias</strong>.
                        </span>
                    </div>
                )}

                {subscription.status === "past_due" && (
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
                        <span className="material-symbols-outlined text-[18px]">warning</span>
                        <span>Plano expirado em {formatDate(subscription.ends_at)}. Entre em contato para continuar.</span>
                    </div>
                )}

                {subscription.status === "canceled" && (
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        <span className="material-symbols-outlined text-[18px]">block</span>
                        <span>Conta cancelada em {formatDate(subscription.canceled_at)}. Fale conosco para reativar.</span>
                    </div>
                )}

                {/* Funcionalidades do plano */}
                <ul className="flex flex-col gap-1.5 pt-1">
                    {features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-[#92bbc9]">
                            <span className="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span>
                            {f}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Limites de uso */}
            <div>
                <h4 className="text-sm font-semibold text-[#92bbc9] uppercase tracking-wider mb-3">
                    Uso atual
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <LimitCard
                        icon="storefront"
                        label="Unidades"
                        used={unitCount}
                        limit={plan.max_units}
                        unit="unidades ativas"
                    />
                    <LimitCard
                        icon="manage_accounts"
                        label="Gestores"
                        used={null}
                        limit={plan.max_managers}
                        unit="gestores na conta"
                    />
                    <LimitCard
                        icon="groups"
                        label="Operadores"
                        used={null}
                        limit={plan.max_staff_per_unit}
                        unit="por unidade"
                    />
                </div>
                <p className="text-xs text-[#325a67] mt-2">
                    Contagem de gestores e operadores disponível na lista de equipe.
                </p>
            </div>

            {/* CTA de upgrade */}
            <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold text-white mb-0.5">Precisa de mais recursos?</p>
                    <p className="text-xs text-[#92bbc9]">Fale com nosso suporte para fazer upgrade do plano.</p>
                </div>
                <a
                    href="https://wa.me/5567991364767?text=Olá, quero fazer upgrade do meu plano no Ordem na Mesa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-[#13b6ec] text-[#101d22] px-4 py-2.5 rounded-lg font-semibold hover:bg-white transition-colors text-sm whitespace-nowrap shrink-0"
                >
                    <span className="material-symbols-outlined text-[18px]">chat</span>
                    Fazer upgrade
                </a>
            </div>
        </div>
    )
}
