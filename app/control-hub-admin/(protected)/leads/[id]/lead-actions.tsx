'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    approveLeadAction,
    rejectLeadAction,
    markContactedAction,
    type ApproveLeadResult,
} from '../actions'
import type { Lead } from '@/lib/admin-leads-control-hub/types'
import type { DuplicateCheckResult } from '@/lib/admin-leads-control-hub/duplicate-check'

export function LeadActions({ leadId, status }: { leadId: string; status: Lead['status'] }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateCheckResult | null>(null)

    function runApprove(force: boolean) {
        setError(null)
        startTransition(async () => {
            const r: ApproveLeadResult = await approveLeadAction(leadId, { force })
            if (r.requiresConfirmation && r.duplicates) {
                setPendingDuplicates(r.duplicates)
                return
            }
            if (r.error) setError(r.error)
            else {
                setPendingDuplicates(null)
                router.refresh()
            }
        })
    }

    function run(fn: () => Promise<{ ok?: boolean; error?: string }>, confirmMsg?: string) {
        if (confirmMsg && !confirm(confirmMsg)) return
        setError(null)
        startTransition(async () => {
            const r = await fn()
            if (r.error) setError(r.error)
            else router.refresh()
        })
    }

    if (status === 'approved') {
        return (
            <span className="inline-flex items-center rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-bold text-success">
                ✅ Aprovado
            </span>
        )
    }
    if (status === 'rejected') {
        return (
            <span className="inline-flex items-center rounded-xl border border-border-dark bg-surface-deep px-4 py-3 text-sm font-bold text-text-secondary">
                Rejeitado
            </span>
        )
    }

    return (
        <>
            {status === 'new' && (
                <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => markContactedAction(leadId))}
                    className="rounded-xl border border-border-dark bg-surface-deep px-5 py-3 text-sm font-bold text-text-secondary transition-colors hover:border-primary/40 hover:text-white disabled:opacity-60"
                >
                    Marcar contatado
                </button>
            )}
            <button
                type="button"
                disabled={pending}
                onClick={() => {
                    if (!confirm('Aprovar este lead? Será criado restaurante + usuário + trial e enviado email.')) return
                    runApprove(false)
                }}
                className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-[#111e22] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] transition-all duration-200 hover:bg-[#0ea5d6] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
                {pending ? 'Processando…' : 'Aprovar'}
            </button>
            <button
                type="button"
                disabled={pending}
                onClick={() => {
                    const reason = prompt('Motivo da rejeição (opcional):') ?? undefined
                    run(() => rejectLeadAction(leadId, reason), 'Rejeitar este lead?')
                }}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-60"
            >
                Rejeitar
            </button>
            {error && (
                <div className="basis-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}
            {pendingDuplicates && (
                <div className="basis-full rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                    <div className="mb-2 text-sm font-bold text-amber-300">
                        ⚠️ Possíveis duplicidades encontradas
                    </div>
                    <DuplicateSummary duplicates={pendingDuplicates} />
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => runApprove(true)}
                            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-[#111e22] transition-colors hover:bg-amber-400 disabled:opacity-60"
                        >
                            Aprovar mesmo assim
                        </button>
                        <button
                            type="button"
                            onClick={() => setPendingDuplicates(null)}
                            className="rounded-lg border border-border-dark bg-surface-deep px-4 py-2 text-sm font-semibold text-text-secondary hover:text-white"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}

function DuplicateSummary({ duplicates }: { duplicates: DuplicateCheckResult }) {
    return (
        <ul className="space-y-1 text-sm text-amber-100">
            {duplicates.emailMatch && (
                <li>
                    • Email já existe no sistema:{' '}
                    <span className="font-semibold">{duplicates.emailMatch.email}</span>
                </li>
            )}
            {duplicates.accountMatches.length > 0 && (
                <li>
                    • Accounts com nome parecido:{' '}
                    <span className="font-semibold">
                        {duplicates.accountMatches.map((m) => m.name).join(', ')}
                    </span>
                </li>
            )}
            {duplicates.restaurantMatches.length > 0 && (
                <li>
                    • Restaurantes com nome parecido:{' '}
                    <span className="font-semibold">
                        {duplicates.restaurantMatches.map((m) => m.name).join(', ')}
                    </span>
                </li>
            )}
        </ul>
    )
}
