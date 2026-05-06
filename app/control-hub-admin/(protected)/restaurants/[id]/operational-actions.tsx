'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    suspendAccountAction,
    reactivateAccountAction,
    extendTrialAction,
    changePlanAction,
    toggleVipAction,
} from '../actions'

type ActiveForm = 'suspend' | 'extend' | 'change-plan' | null

interface PlanOption {
    id: string
    code: string
    name: string
}

interface Props {
    restaurantId: string
    isSuperAdmin: boolean
    accountActive: boolean
    isVip: boolean
    canExtendTrial: boolean
    currentPlanId: string | null
    currentCycle: 'monthly' | 'yearly' | null
    plans: PlanOption[]
}

export function OperationalActions(props: Props) {
    const {
        restaurantId,
        isSuperAdmin,
        accountActive,
        isVip,
        canExtendTrial,
        currentPlanId,
        currentCycle,
        plans,
    } = props

    const [activeForm, setActiveForm] = useState<ActiveForm>(null)
    const [pending, startTransition] = useTransition()
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
    const router = useRouter()

    if (!isSuperAdmin) {
        return (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                Apenas SUPER_ADMIN pode executar ações operacionais.
            </div>
        )
    }

    function run(fn: () => Promise<{ ok?: boolean; error?: string }>, successMsg: string) {
        setFeedback(null)
        startTransition(async () => {
            const r = await fn()
            if (r.error) {
                setFeedback({ type: 'error', msg: r.error })
            } else {
                setFeedback({ type: 'ok', msg: successMsg })
                setActiveForm(null)
                router.refresh()
            }
        })
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {accountActive ? (
                    <button
                        type="button"
                        onClick={() => setActiveForm(activeForm === 'suspend' ? null : 'suspend')}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20"
                    >
                        🚫 Suspender conta
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                            if (!confirm('Reativar a account e restaurar acesso?')) return
                            run(() => reactivateAccountAction(restaurantId), 'Conta reativada.')
                        }}
                        className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-bold text-success hover:bg-success/20 disabled:opacity-50"
                    >
                        {pending ? 'Processando…' : '✅ Reativar conta'}
                    </button>
                )}

                <button
                    type="button"
                    disabled={!canExtendTrial}
                    onClick={() => setActiveForm(activeForm === 'extend' ? null : 'extend')}
                    className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-bold text-text-secondary hover:border-primary/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    title={canExtendTrial ? '' : 'Disponível apenas para subscriptions em status "trial"'}
                >
                    ⏱ Estender trial
                </button>

                <button
                    type="button"
                    onClick={() => setActiveForm(activeForm === 'change-plan' ? null : 'change-plan')}
                    className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-bold text-text-secondary hover:border-primary/40 hover:text-white"
                >
                    🔄 Alterar plano
                </button>

                <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                        const next = !isVip
                        if (!confirm(next ? 'Marcar conta como VIP?' : 'Remover marca VIP?')) return
                        run(
                            () => toggleVipAction(restaurantId, next),
                            next ? 'Marcado como VIP.' : 'VIP removido.'
                        )
                    }}
                    className={
                        isVip
                            ? 'rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-400/20 disabled:opacity-50'
                            : 'rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-bold text-text-secondary hover:border-primary/40 hover:text-white disabled:opacity-50'
                    }
                >
                    {isVip ? '⭐ Remover VIP' : '⭐ Marcar VIP'}
                </button>
            </div>

            {activeForm === 'suspend' && (
                <SuspendForm
                    pending={pending}
                    onCancel={() => setActiveForm(null)}
                    onSubmit={(reason) =>
                        run(() => suspendAccountAction(restaurantId, reason), 'Conta suspensa.')
                    }
                />
            )}

            {activeForm === 'extend' && (
                <ExtendTrialForm
                    pending={pending}
                    onCancel={() => setActiveForm(null)}
                    onSubmit={(days) =>
                        run(
                            () => extendTrialAction(restaurantId, days),
                            `Trial estendido em ${days} dias.`
                        )
                    }
                />
            )}

            {activeForm === 'change-plan' && (
                <ChangePlanForm
                    plans={plans}
                    currentPlanId={currentPlanId}
                    currentCycle={currentCycle}
                    pending={pending}
                    onCancel={() => setActiveForm(null)}
                    onSubmit={(planId, cycle) =>
                        run(
                            () => changePlanAction(restaurantId, planId, cycle),
                            'Plano alterado.'
                        )
                    }
                />
            )}

            {feedback && (
                <div
                    className={
                        feedback.type === 'ok'
                            ? 'rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success'
                            : 'rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300'
                    }
                >
                    {feedback.msg}
                </div>
            )}
        </div>
    )
}

function SuspendForm({
    pending,
    onCancel,
    onSubmit,
}: {
    pending: boolean
    onCancel: () => void
    onSubmit: (reason: string) => void
}) {
    const [reason, setReason] = useState('')
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                if (!confirm(`Suspender esta account? Os usuários serão deslogados.\n\nMotivo: ${reason}`)) return
                onSubmit(reason)
            }}
            className="rounded-lg border border-red-500/30 bg-red-500/5 p-3"
        >
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                Motivo da suspensão
            </label>
            <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Ex.: inadimplência confirmada, pedido do cliente, etc."
                className="w-full rounded-lg border border-border-dark bg-surface-deep p-2 text-sm text-white placeholder:text-[#5a7b88] focus:border-primary focus:outline-0"
                required
                minLength={3}
            />
            <div className="mt-2 flex gap-2">
                <button
                    type="submit"
                    disabled={pending || reason.trim().length < 3}
                    className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                >
                    {pending ? 'Suspendendo…' : 'Confirmar suspensão'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={pending}
                    className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-white"
                >
                    Cancelar
                </button>
            </div>
        </form>
    )
}

function ExtendTrialForm({
    pending,
    onCancel,
    onSubmit,
}: {
    pending: boolean
    onCancel: () => void
    onSubmit: (days: number) => void
}) {
    const [days, setDays] = useState(7)
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                if (!confirm(`Estender trial em ${days} dia(s)?`)) return
                onSubmit(days)
            }}
            className="rounded-lg border border-border-dark bg-surface-deep p-3"
        >
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                Dias adicionais (1–90)
            </label>
            <input
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number.parseInt(e.target.value, 10) || 0)}
                className="h-10 w-32 rounded-lg border border-border-dark bg-background-dark px-3 text-sm text-white focus:border-primary focus:outline-0"
            />
            <div className="mt-2 flex gap-2">
                <button
                    type="submit"
                    disabled={pending || days < 1 || days > 90}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-[#111e22] hover:bg-[#0ea5d6] disabled:opacity-50"
                >
                    {pending ? 'Estendendo…' : 'Confirmar'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={pending}
                    className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-white"
                >
                    Cancelar
                </button>
            </div>
        </form>
    )
}

function ChangePlanForm({
    plans,
    currentPlanId,
    currentCycle,
    pending,
    onCancel,
    onSubmit,
}: {
    plans: PlanOption[]
    currentPlanId: string | null
    currentCycle: 'monthly' | 'yearly' | null
    pending: boolean
    onCancel: () => void
    onSubmit: (planId: string, cycle: 'monthly' | 'yearly') => void
}) {
    const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? '')
    const [cycle, setCycle] = useState<'monthly' | 'yearly'>(currentCycle ?? 'monthly')
    const selected = plans.find((p) => p.id === planId)
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                if (!planId) return
                if (
                    !confirm(
                        `Alterar plano para ${selected?.code ?? '?'} (${cycle})? A ação não notifica o cliente automaticamente.`
                    )
                )
                    return
                onSubmit(planId, cycle)
            }}
            className="rounded-lg border border-border-dark bg-surface-deep p-3"
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                        Plano
                    </label>
                    <select
                        value={planId}
                        onChange={(e) => setPlanId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border-dark bg-background-dark px-3 text-sm text-white focus:border-primary focus:outline-0"
                    >
                        {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.code} · {p.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                        Ciclo
                    </label>
                    <select
                        value={cycle}
                        onChange={(e) => setCycle(e.target.value as 'monthly' | 'yearly')}
                        className="h-10 w-full rounded-lg border border-border-dark bg-background-dark px-3 text-sm text-white focus:border-primary focus:outline-0"
                    >
                        <option value="monthly">Mensal</option>
                        <option value="yearly">Anual</option>
                    </select>
                </div>
            </div>
            <div className="mt-3 flex gap-2">
                <button
                    type="submit"
                    disabled={pending || !planId}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-[#111e22] hover:bg-[#0ea5d6] disabled:opacity-50"
                >
                    {pending ? 'Alterando…' : 'Confirmar alteração'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={pending}
                    className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-white"
                >
                    Cancelar
                </button>
            </div>
        </form>
    )
}
