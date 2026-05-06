'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resolveAlertAction, runAutomationAction } from './actions'

export function RunAutomationButton({ isSuperAdmin }: { isSuperAdmin: boolean }) {
    const [pending, startTransition] = useTransition()
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
    const router = useRouter()

    if (!isSuperAdmin) {
        return (
            <span className="text-[11px] text-yellow-300/80">
                Apenas SUPER_ADMIN pode rodar a automação.
            </span>
        )
    }

    function run() {
        if (!confirm('Rodar a automação de alertas agora? Pode levar alguns segundos.')) return
        setFeedback(null)
        startTransition(async () => {
            const res = await runAutomationAction()
            if (res.error) {
                setFeedback({ type: 'error', msg: res.error })
            } else if (res.result) {
                setFeedback({
                    type: 'ok',
                    msg: `Avaliados: ${res.result.evaluated} · Criados: ${res.result.created} · Auto-resolvidos: ${res.result.autoResolved}`,
                })
                router.refresh()
            }
        })
    }

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={run}
                disabled={pending}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-[#111e22] shadow-[0_2px_8px_0_rgba(19,182,236,0.3)] hover:bg-[#0ea5d6] disabled:opacity-50"
            >
                {pending ? 'Rodando…' : '⚙️ Rodar automação agora'}
            </button>
            {feedback && (
                <span
                    className={
                        feedback.type === 'ok'
                            ? 'text-[11px] text-success'
                            : 'text-[11px] text-red-300'
                    }
                >
                    {feedback.msg}
                </span>
            )}
        </div>
    )
}

export function ResolveAlertButton({ alertId }: { alertId: string }) {
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    function resolve() {
        const reason = prompt('Motivo da resolução (opcional):') ?? undefined
        // Se o usuário cancela o prompt, reason === null → tratamos como cancelar ação.
        if (reason === undefined && !confirm('Resolver sem informar motivo?')) return
        setError(null)
        startTransition(async () => {
            const res = await resolveAlertAction(alertId, reason)
            if (res.error) setError(res.error)
            else router.refresh()
        })
    }

    return (
        <>
            <button
                type="button"
                onClick={resolve}
                disabled={pending}
                className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success hover:bg-success/20 disabled:opacity-50"
            >
                {pending ? '…' : 'Resolver'}
            </button>
            {error && <span className="ml-2 text-[10px] text-red-300">{error}</span>}
        </>
    )
}
