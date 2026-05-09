'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    approveLeadAction,
    rejectLeadAction,
    type ApproveLeadResult,
} from './actions'
import type { Lead } from '@/lib/admin-leads-control-hub/types'

export function LeadQuickActions({
    leadId,
    status,
    whatsappUrl,
    detailHref,
}: {
    leadId: string
    status: Lead['status']
    whatsappUrl: string
    detailHref: string
}) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const canActOnApprove = status === 'new' || status === 'contacted'

    function handleApprove(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Aprovar este lead? Será criado restaurante + usuário + trial.')) return
        setError(null)
        startTransition(async () => {
            const r: ApproveLeadResult = await approveLeadAction(leadId)
            if (r.requiresConfirmation) {
                router.push(detailHref)
                return
            }
            if (r.error) setError(r.error)
            else router.refresh()
        })
    }

    function handleReject(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        const reason = prompt('Motivo da rejeição (opcional):') ?? undefined
        if (!confirm('Rejeitar este lead?')) return
        setError(null)
        startTransition(async () => {
            const r = await rejectLeadAction(leadId, reason)
            if (r.error) setError(r.error)
            else router.refresh()
        })
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="WhatsApp"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-success/40 bg-success/10 text-success transition-colors hover:bg-success/20"
            >
                💬
            </a>
            {canActOnApprove && (
                <>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={handleApprove}
                        title="Aprovar"
                        className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-bold text-[#111e22] transition-colors hover:bg-[#0ea5d6] disabled:opacity-60"
                    >
                        {pending ? '…' : 'Aprovar'}
                    </button>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={handleReject}
                        title="Rejeitar"
                        className="inline-flex h-9 items-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-60"
                    >
                        Rejeitar
                    </button>
                </>
            )}
            {error && (
                <span
                    className="text-xs text-red-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    {error}
                </span>
            )}
        </div>
    )
}
