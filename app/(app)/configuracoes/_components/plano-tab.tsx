"use client"

import { useState } from "react"
import { useBilling, ApiError as BillingApiError } from "@/lib/hooks/use-billing"
import { usePlans, type CatalogPlan } from "@/lib/hooks/use-plans"
import { useCheckout } from "@/lib/hooks/use-checkout"
import { usePortal } from "@/lib/hooks/use-portal"
import { useChangePlan } from "@/lib/hooks/use-change-plan"
import { useUsage } from "@/lib/hooks/use-usage"
import { useSubscriptionDiscount, type ActiveDiscount } from "@/lib/hooks/use-subscription-discount"
import { useAccountSessionStore } from "@/lib/store/account-session-store"
import { useAccountUnits } from "@/lib/hooks/use-account-units"
import type { BillingCycle } from "@/lib/billing/types"

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

function formatEpoch(epoch: number | null): string {
    if (!epoch) return "—"
    return new Date(epoch * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

/** "50% OFF" / "R$ 10,00 OFF" — vindos do coupon do Stripe. */
function discountAmountText(d: ActiveDiscount): string {
    if (d.percent_off != null) {
        const n = Number.isInteger(d.percent_off) ? d.percent_off : d.percent_off.toFixed(2)
        return `${n}% OFF`
    }
    if (d.amount_off != null) return `${formatCents(d.amount_off)} OFF`
    return "Desconto"
}

/** "vitalício" / "por 3 meses" / "apenas na próxima cobrança" — direto do Stripe. */
function discountDurationText(d: ActiveDiscount): string {
    if (d.duration === "once") return "apenas na próxima cobrança"
    if (d.duration === "forever") return "vitalício"
    if (d.duration_in_months) return `por ${d.duration_in_months} ${d.duration_in_months === 1 ? "mês" : "meses"}`
    return "recorrente"
}

/**
 * Estimativa da próxima cobrança: preço do ciclo atual menos desconto.
 * Sem proration, sem upcoming-invoice. Apenas multiplica/subtrai do coupon.
 * Suficiente como "estimada"; valor exato sai no Dashboard / na fatura real.
 */
function nextChargeCentsEstimate(
    plan: { price_monthly_cents: number; price_yearly_cents: number },
    cycle: BillingCycle,
    discount: ActiveDiscount | null | undefined
): number {
    // billing_cycle=yearly → cobrança anual = monthly-equivalente × 12.
    const base = cycle === "yearly" ? plan.price_yearly_cents * 12 : plan.price_monthly_cents
    if (!discount) return base
    let v = base
    if (discount.percent_off != null) v = v * (1 - discount.percent_off / 100)
    if (discount.amount_off != null) v = v - discount.amount_off
    return Math.max(0, Math.round(v))
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
    const { data: billing, isLoading, error: billingError } = useBilling()
    const { data: plans = [] } = usePlans()
    const accountId = useAccountSessionStore((s) => s.accountId)
    const { data: units = [] } = useAccountUnits(accountId)

    const { data: usage } = useUsage()
    const { data: discount } = useSubscriptionDiscount()

    // Hooks SEMPRE antes de qualquer return condicional (rules of hooks).
    const [cycle, setCycle] = useState<BillingCycle>("monthly")
    const [confirmChange, setConfirmChange] = useState<{ plan: CatalogPlan; exceeded: string[] } | null>(null)
    const [promoInput, setPromoInput] = useState("")
    const checkout = useCheckout()
    const portal = usePortal()
    const changePlan = useChangePlan()
    const checkoutResult =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("checkout") : null

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <div className="w-8 h-8 rounded-full border-2 border-[#13b6ec] border-t-transparent animate-spin" />
            </div>
        )
    }

    if (!billing) {
        const code = billingError instanceof BillingApiError ? billingError.code : undefined
        if (code === "forbidden_billing") {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
                    <span className="material-symbols-outlined text-[#325a67] text-5xl">lock</span>
                    <p className="text-[#92bbc9] text-sm max-w-md">
                        Apenas o proprietário da conta pode gerenciar o plano e a assinatura.
                    </p>
                </div>
            )
        }
        if (code === "not_account_member") {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
                    <span className="material-symbols-outlined text-[#325a67] text-5xl">link_off</span>
                    <p className="text-[#92bbc9] text-sm max-w-md">
                        Sua conta de usuário ainda não foi vinculada a esta unidade na camada de billing.
                        Contate o proprietário ou suporte.
                    </p>
                </div>
            )
        }
        if (code === "no_subscription") {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
                    <span className="material-symbols-outlined text-[#325a67] text-5xl">workspace_premium</span>
                    <p className="text-[#92bbc9] text-sm">Nenhum plano contratado nesta conta.</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-2 inline-flex items-center justify-center gap-2 bg-[#13b6ec] text-[#101d22] px-4 py-2.5 rounded-lg font-semibold hover:bg-white transition-colors text-sm"
                    >
                        Contratar um plano
                    </button>
                </div>
            )
        }
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
                <span className="material-symbols-outlined text-[#325a67] text-5xl">workspace_premium</span>
                <p className="text-[#92bbc9] text-sm">Não foi possível carregar o plano.</p>
            </div>
        )
    }

    const { subscription, plan, days_until_expiration } = billing
    const statusInfo = STATUS_LABEL[subscription.status] ?? STATUS_LABEL.incomplete
    const unitCount = units.length
    const isActive = subscription.status === "active"
    const mutating = checkout.isPending || changePlan.isPending
    const actionError = checkout.error?.message ?? changePlan.error?.message ?? null

    // Limites do plano alvo que o uso atual excede (vazio = dentro do limite).
    function exceededLimits(p: CatalogPlan): string[] {
        if (!usage) return []
        const out: string[] = []
        if (usage.units > p.max_units) out.push(`${usage.units} unidades utilizadas (limite: ${p.max_units})`)
        if (usage.managers > p.max_managers) out.push(`${usage.managers} gestores (limite: ${p.max_managers})`)
        if (usage.max_staff_per_unit > p.max_staff_per_unit)
            out.push(`${usage.max_staff_per_unit} operadores numa unidade (limite: ${p.max_staff_per_unit})`)
        return out
    }

    // Define o CTA de cada card do comparador conforme estado da assinatura.
    function planCta(p: CatalogPlan) {
        const isCurrent = isActive && p.code === plan.code && cycle === subscription.billing_cycle
        if (isCurrent) {
            return { label: "Plano atual", disabled: true, current: true, onClick: () => {} }
        }
        if (!isActive) {
            // trial / past_due / canceled / etc → assinar (checkout cria a assinatura)
            return {
                label: "Assinar plano",
                disabled: mutating,
                current: false,
                onClick: () => checkout.mutate({ plan_code: p.code, cycle }),
            }
        }
        // Ativo trocando de plano/ciclo → Stripe-native (subscriptions.update via webhook)
        let label: string
        if (p.code === plan.code) {
            label = cycle === "yearly" ? "Mudar para anual" : "Mudar para mensal"
        } else {
            label = p.price_monthly_cents > plan.price_monthly_cents ? "Fazer upgrade" : "Fazer downgrade"
        }
        return {
            label,
            disabled: mutating,
            current: false,
            // Toda troca passa pela confirmação financeira (proration). Se o uso
            // excede o plano alvo (downgrade), o modal também mostra o aviso.
            onClick: () => {
                setConfirmChange({ plan: p, exceeded: exceededLimits(p) })
                setPromoInput("")
                changePlan.reset()
            },
        }
    }

    return (
        <div className="flex flex-col gap-6 max-w-4xl">
            {/* Header do plano atual */}
            <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-[#13b6ec] text-[22px]">workspace_premium</span>
                            <h3 className="text-xl font-bold text-white font-fraunces">{plan.name}</h3>
                        </div>
                        <p className="text-sm text-[#92bbc9]">
                            Plano {isActive ? "ativo" : "atual"} · cobrança{" "}
                            {subscription.billing_cycle === "yearly" ? "anual" : "mensal"}
                        </p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${statusInfo.color}`}>
                        {statusInfo.label}
                    </span>
                </div>

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
                        <span>Plano expirado em {formatDate(subscription.ends_at)}. Assine para continuar.</span>
                    </div>
                )}
                {subscription.status === "canceled" && (
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        <span className="material-symbols-outlined text-[18px]">block</span>
                        <span>Conta cancelada em {formatDate(subscription.canceled_at)}. Assine para reativar.</span>
                    </div>
                )}
            </div>

            {/* Desconto ativo (Stripe é source of truth; sem persistência local) */}
            {discount && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-400 text-[20px]">local_offer</span>
                            <div>
                                <p className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">Desconto ativo</p>
                                <p className="text-sm text-white font-semibold mt-0.5">
                                    {discount.label}
                                    <span className="text-[#92bbc9] font-normal"> · {discountAmountText(discount)} {discountDurationText(discount)}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-3">
                            <p className="text-xs text-[#92bbc9] mb-0.5">Próxima cobrança estimada</p>
                            <p className="text-white font-semibold">
                                {formatCents(nextChargeCentsEstimate(plan, subscription.billing_cycle, discount))}
                                <span className="text-xs text-[#92bbc9] font-normal ml-1">
                                    ({subscription.billing_cycle === "yearly" ? "anual" : "mensal"})
                                </span>
                            </p>
                        </div>
                        {discount.duration === "repeating" && discount.ends_at && (
                            <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-3">
                                <p className="text-xs text-[#92bbc9] mb-0.5">Desconto termina em</p>
                                <p className="text-white font-semibold">{formatEpoch(discount.ends_at)}</p>
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-[#325a67]">
                        {discount.duration === "once"
                            ? "Após esta cobrança, o valor volta ao preço cheio do plano."
                            : discount.duration === "repeating"
                              ? "Após o término do desconto, o valor volta ao preço cheio do plano."
                              : "O desconto permanece em todas as cobranças, inclusive após upgrade/downgrade."}
                    </p>
                </div>
            )}

            {/* Limites de uso */}
            <div>
                <h4 className="text-sm font-semibold text-[#92bbc9] uppercase tracking-wider mb-3">Uso atual</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <LimitCard icon="storefront" label="Unidades" used={unitCount} limit={plan.max_units} unit="unidades ativas" />
                    <LimitCard icon="manage_accounts" label="Gestores" used={null} limit={plan.max_managers} unit="gestores na conta" />
                    <LimitCard icon="groups" label="Operadores" used={null} limit={plan.max_staff_per_unit} unit="por unidade" />
                </div>
                <p className="text-xs text-[#325a67] mt-2">Contagem de gestores e operadores disponível na lista de equipe.</p>
            </div>

            {/* Feedback pós-redirect do Stripe Checkout */}
            {checkoutResult === "success" && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Pagamento recebido! Seu plano será atualizado em instantes.</span>
                </div>
            )}
            {checkoutResult === "cancel" && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
                    <span className="material-symbols-outlined text-[18px]">info</span>
                    <span>Checkout cancelado. Você pode tentar novamente quando quiser.</span>
                </div>
            )}

            {/* Comparador de planos */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h4 className="text-sm font-semibold text-[#92bbc9] uppercase tracking-wider">
                        {isActive ? "Trocar de plano" : "Escolha seu plano"}
                    </h4>
                    {/* Toggle mensal / anual */}
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#101d22] border border-[#233f48] rounded-xl w-full sm:w-auto">
                        {(["monthly", "yearly"] as BillingCycle[]).map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setCycle(c)}
                                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                                    cycle === c ? "bg-[#13b6ec] text-[#101d22]" : "text-[#92bbc9] hover:text-white"
                                }`}
                            >
                                {c === "monthly" ? "Mensal" : "Anual"}
                            </button>
                        ))}
                    </div>
                </div>

                {actionError && <p className="text-sm text-red-400">{actionError}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {plans.map((p) => {
                        const cta = planCta(p)
                        const cents = cycle === "yearly" ? p.price_yearly_cents : p.price_monthly_cents
                        const features = PLAN_FEATURES[p.code] ?? []
                        const pendingThis =
                            (checkout.isPending && checkout.variables?.plan_code === p.code) ||
                            (changePlan.isPending && changePlan.variables?.plan_code === p.code)
                        return (
                            <div
                                key={p.code}
                                className={`rounded-2xl p-5 flex flex-col gap-3 border ${
                                    cta.current
                                        ? "bg-[#13b6ec]/5 border-[#13b6ec]"
                                        : "bg-[#16262c] border-[#233f48]"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-lg font-bold text-white font-fraunces">{p.name}</h5>
                                    {cta.current && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#13b6ec] bg-[#13b6ec]/10 border border-[#13b6ec]/20 rounded-full px-2 py-0.5">
                                            Atual
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-white">{formatCents(cents)}</span>
                                    <span className="text-xs text-[#92bbc9]">
                                        /mês{cycle === "yearly" ? " · anual" : ""}
                                    </span>
                                </div>
                                <ul className="flex flex-col gap-1.5">
                                    {features.map((f) => (
                                        <li key={f} className="flex items-center gap-2 text-sm text-[#92bbc9]">
                                            <span className="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span>
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    disabled={cta.disabled}
                                    onClick={cta.onClick}
                                    className={`mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:cursor-not-allowed ${
                                        cta.current
                                            ? "bg-[#1a2c32] text-[#92bbc9] border border-[#233f48]"
                                            : "bg-[#13b6ec] text-[#101d22] hover:bg-white disabled:opacity-60"
                                    }`}
                                >
                                    {pendingThis ? (
                                        <>
                                            <span className="w-4 h-4 rounded-full border-2 border-[#101d22] border-t-transparent animate-spin" />
                                            Processando…
                                        </>
                                    ) : (
                                        cta.label
                                    )}
                                </button>
                            </div>
                        )
                    })}
                </div>

                {!isActive && (
                    <p className="text-xs text-[#325a67] text-center">
                        Pagamento processado com segurança pela Stripe. Cupons podem ser aplicados na próxima tela.
                    </p>
                )}
            </div>

            {/* Gestão de pagamento (cartão, faturas, cancelamento) — só para ativos */}
            {isActive && (
                <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-white mb-0.5">Pagamento e faturas</p>
                        <p className="text-xs text-[#92bbc9]">Atualize o cartão, veja faturas ou cancele a assinatura.</p>
                    </div>
                    {portal.isError && <p className="text-sm text-red-400">{portal.error?.message}</p>}
                    <button
                        type="button"
                        disabled={portal.isPending}
                        onClick={() => portal.mutate()}
                        className="flex items-center justify-center gap-2 bg-[#1a2c32] text-white border border-[#233f48] px-4 py-2.5 rounded-lg font-semibold hover:border-[#13b6ec] transition-colors text-sm whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {portal.isPending ? (
                            <>
                                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                Abrindo…
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">settings</span>
                                Gerenciar pagamento
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Confirmação financeira da troca de plano (proration via Stripe) */}
            {confirmChange && (() => {
                const target = confirmChange.plan
                const currentCents =
                    subscription.billing_cycle === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents
                const newCents = cycle === "yearly" ? target.price_yearly_cents : target.price_monthly_cents
                const currentCycleLabel = subscription.billing_cycle === "yearly" ? "anual" : "mensal"
                const newCycleLabel = cycle === "yearly" ? "anual" : "mensal"
                const isUpgrade = target.price_monthly_cents > plan.price_monthly_cents
                const sameCycle = subscription.billing_cycle === cycle
                const title =
                    target.code === plan.code
                        ? "Mudar ciclo de cobrança"
                        : isUpgrade
                          ? "Confirmar upgrade"
                          : "Confirmar downgrade"
                return (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
                        <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
                            <h3 className="text-lg font-bold text-white">{title}</h3>

                            {/* Resumo atual → novo */}
                            <div className="bg-[#101d22] border border-[#233f48] rounded-xl p-4 flex items-center justify-between gap-3">
                                <div className="text-sm">
                                    <p className="text-[#92bbc9] text-xs mb-0.5">Atual</p>
                                    <p className="text-white font-semibold">{plan.name}</p>
                                    <p className="text-[#92bbc9]">{formatCents(currentCents)}/mês · {currentCycleLabel}</p>
                                </div>
                                <span className="material-symbols-outlined text-[#13b6ec]">arrow_forward</span>
                                <div className="text-sm text-right">
                                    <p className="text-[#92bbc9] text-xs mb-0.5">Novo</p>
                                    <p className="text-white font-semibold">{target.name}</p>
                                    <p className="text-[#13b6ec]">{formatCents(newCents)}/mês · {newCycleLabel}</p>
                                </div>
                            </div>

                            {/* Explicação clara (Stripe cuida da proration) */}
                            <ul className="flex flex-col gap-1.5 text-sm text-[#92bbc9]">
                                <li className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px] mt-0.5">bolt</span>
                                    A alteração é aplicada <strong className="text-white">imediatamente</strong>.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px] mt-0.5">balance</span>
                                    A Stripe calcula automaticamente {isUpgrade && sameCycle ? "a cobrança" : "cobranças ou créditos"} proporcionais.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px] mt-0.5">event_repeat</span>
                                    No próximo ciclo você paga o valor do novo plano.
                                </li>
                            </ul>

                            {/* Aviso de limites excedidos (downgrade) */}
                            {confirmChange.exceeded.length > 0 && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex flex-col gap-1.5">
                                    <p className="text-sm text-amber-300 font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[16px]">warning</span>
                                        Seu uso excede o novo plano
                                    </p>
                                    {confirmChange.exceeded.map((e) => (
                                        <p key={e} className="text-xs text-amber-300 pl-6">• {e}</p>
                                    ))}
                                    <p className="text-xs text-[#92bbc9] pl-6">
                                        Seus dados não serão removidos; apenas novas criações ficam bloqueadas até adequar.
                                    </p>
                                </div>
                            )}

                            {/* Código promocional (opcional, mobile-first) */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-[#92bbc9]">
                                    Código promocional (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={promoInput}
                                    onChange={(e) => {
                                        setPromoInput(e.target.value)
                                        if (changePlan.isError) changePlan.reset()
                                    }}
                                    placeholder="Ex.: SMOKEGOLIVE"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    className="bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2 text-sm text-white placeholder-[#325a67] focus:border-[#13b6ec] outline-none"
                                />
                                {promoInput.trim().length > 0 && (
                                    discount ? (
                                        <div className="text-xs bg-amber-500/5 border border-amber-500/20 rounded-lg p-2 flex flex-col gap-0.5">
                                            <p className="text-amber-300">
                                                <span className="font-semibold">Desconto atual:</span> {discount.label} — {discountAmountText(discount)} {discountDurationText(discount)}
                                            </p>
                                            <p className="text-[#92bbc9]">O novo código substituirá o desconto atual.</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-[#92bbc9]">
                                            Este código será aplicado à sua assinatura.
                                        </p>
                                    )
                                )}
                                {changePlan.isError && (
                                    <p className="text-xs text-red-400">
                                        {changePlan.error?.message ?? "Não foi possível aplicar."}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setConfirmChange(null)
                                        setPromoInput("")
                                        changePlan.reset()
                                    }}
                                    className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[#92bbc9] bg-[#1a2c32] border border-[#233f48] hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={changePlan.isPending}
                                    onClick={() => {
                                        // Fecha o modal APENAS no sucesso, para o erro de cupom ficar inline.
                                        changePlan.mutate(
                                            {
                                                plan_code: target.code,
                                                cycle,
                                                promotion_code: promoInput.trim() || undefined,
                                            },
                                            {
                                                onSuccess: () => {
                                                    setConfirmChange(null)
                                                    setPromoInput("")
                                                },
                                            }
                                        )
                                    }}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#13b6ec] text-[#101d22] hover:bg-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {changePlan.isPending ? "Processando…" : "Confirmar troca"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
