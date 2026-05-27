'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resendSetupEmailAction } from './actions'

interface SetupEmailStatusProps {
    leadId: string
    setupEmailSentAt: string | null
    setupEmailLastError: string | null
    variant?: 'compact' | 'full'
}

type BadgeKind = 'sent' | 'pending' | 'failed'

function badgeKind(sentAt: string | null, error: string | null): BadgeKind {
    if (error) return 'failed'
    if (sentAt) return 'sent'
    return 'pending'
}

const BADGE_PRESET: Record<BadgeKind, { prefix: string; cls: string }> = {
    sent: { prefix: '✅ E-mail enviado em', cls: 'bg-success/15 text-success border-success/30' },
    pending: { prefix: '⏳ E-mail pendente', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/40' },
    failed: { prefix: '⚠️ E-mail falhou', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
}

function FormattedTimestamp({ iso }: { iso: string }) {
    // Timestamp depende do timezone do client — `suppressHydrationWarning`
    // evita o mismatch entre SSR (UTC) e hidratação (timezone do usuário).
    return <time suppressHydrationWarning dateTime={iso}>{new Date(iso).toLocaleString('pt-BR')}</time>
}

export function SetupEmailStatus({
    leadId,
    setupEmailSentAt,
    setupEmailLastError,
    variant = 'compact',
}: SetupEmailStatusProps) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

    const kind = badgeKind(setupEmailSentAt, setupEmailLastError)
    const preset = BADGE_PRESET[kind]

    function handleResend() {
        setFeedback(null)
        startTransition(async () => {
            const r = await resendSetupEmailAction(leadId)
            if (r.ok) {
                setFeedback({ kind: 'ok', msg: 'E-mail reenviado com sucesso.' })
                router.refresh()
            } else if (r.throttled) {
                setFeedback({ kind: 'err', msg: r.error ?? 'Aguarde antes de reenviar.' })
            } else {
                setFeedback({ kind: 'err', msg: r.error ?? 'Falha ao reenviar e-mail.' })
            }
        })
    }

    const tooltip = kind === 'failed'
        ? setupEmailLastError ?? undefined
        : kind === 'pending'
          ? 'Nenhum envio bem-sucedido registrado.'
          : undefined

    if (variant === 'compact') {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={`rounded-md border px-2 py-0.5 text-xs font-bold ${preset.cls}`}
                    title={tooltip}
                >
                    {preset.prefix}
                    {kind === 'sent' && setupEmailSentAt && (
                        <>
                            {' '}
                            <FormattedTimestamp iso={setupEmailSentAt} />
                        </>
                    )}
                </span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        handleResend()
                    }}
                    disabled={pending}
                    className="inline-flex h-7 items-center rounded-md border border-border-dark bg-surface-deep px-2 text-[11px] font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-white disabled:opacity-60"
                    title="Reenviar e-mail de setup"
                >
                    {pending ? '…' : 'Reenviar'}
                </button>
                {feedback && (
                    <span
                        className={`text-[11px] ${
                            feedback.kind === 'ok' ? 'text-success' : 'text-red-300'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {feedback.msg}
                    </span>
                )}
            </div>
        )
    }

    return (
        <div
            className={`rounded-2xl border p-4 ${
                kind === 'failed'
                    ? 'border-red-500/40 bg-red-500/10'
                    : kind === 'sent'
                      ? 'border-success/40 bg-success/10'
                      : 'border-amber-500/40 bg-amber-500/10'
            }`}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div
                        className={`text-sm font-bold ${
                            kind === 'failed'
                                ? 'text-red-300'
                                : kind === 'sent'
                                  ? 'text-success'
                                  : 'text-amber-300'
                        }`}
                    >
                        {preset.prefix}
                        {kind === 'sent' && setupEmailSentAt && (
                            <>
                                {' '}
                                <FormattedTimestamp iso={setupEmailSentAt} />
                            </>
                        )}
                    </div>
                    {kind === 'failed' && setupEmailLastError && (
                        <div className="mt-1 break-all text-xs text-red-200/80">
                            Último erro: {setupEmailLastError}
                        </div>
                    )}
                    {kind === 'pending' && (
                        <div className="mt-1 text-xs text-amber-200/80">
                            O cliente ainda não recebeu o e-mail para definir senha.
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={pending}
                    className="rounded-xl border border-border-dark bg-surface-deep px-4 py-2 text-sm font-bold text-text-secondary transition-colors hover:border-primary/40 hover:text-white disabled:opacity-60"
                >
                    {pending ? 'Reenviando…' : 'Reenviar e-mail de setup'}
                </button>
            </div>
            {feedback && (
                <div
                    className={`mt-3 text-sm ${
                        feedback.kind === 'ok' ? 'text-success' : 'text-red-300'
                    }`}
                >
                    {feedback.msg}
                </div>
            )}
        </div>
    )
}
