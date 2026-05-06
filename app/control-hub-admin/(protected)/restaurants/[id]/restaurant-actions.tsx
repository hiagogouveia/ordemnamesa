'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetOwnerPasswordAction } from '../actions'

interface Props {
    restaurantId: string
    ownerEmail: string | null
    ownerPhone: string | null
    isSuperAdmin: boolean
}

export function RestaurantActions({ restaurantId, ownerEmail, ownerPhone, isSuperAdmin }: Props) {
    const [pending, startTransition] = useTransition()
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
    const router = useRouter()

    function copyEmail() {
        if (!ownerEmail) return
        void navigator.clipboard.writeText(ownerEmail).then(() => {
            setFeedback({ type: 'ok', msg: 'Email copiado para a área de transferência.' })
        })
    }

    function resetPassword() {
        if (!isSuperAdmin) {
            setFeedback({ type: 'error', msg: 'Apenas SUPER_ADMIN pode resetar senha.' })
            return
        }
        if (!confirm(`Confirmar envio do link de redefinição para ${ownerEmail}?`)) return
        setFeedback(null)
        startTransition(async () => {
            const res = await resetOwnerPasswordAction(restaurantId)
            if (res.error) {
                setFeedback({ type: 'error', msg: res.error })
            } else {
                setFeedback({ type: 'ok', msg: 'Link de redefinição enviado por email.' })
                router.refresh()
            }
        })
    }

    const whatsappHref = ownerPhone
        ? `https://wa.me/${ownerPhone.replace(/\D/g, '')}`
        : null

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={copyEmail}
                    disabled={!ownerEmail}
                    className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-primary/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    📋 Copiar email
                </button>
                {whatsappHref ? (
                    <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/20"
                    >
                        💬 WhatsApp
                    </a>
                ) : (
                    <span className="rounded-lg border border-border-dark bg-surface-deep px-3 py-1.5 text-xs font-semibold text-text-secondary opacity-50">
                        💬 WhatsApp (sem telefone)
                    </span>
                )}
                <button
                    type="button"
                    onClick={resetPassword}
                    disabled={pending || !isSuperAdmin || !ownerEmail}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-[#111e22] shadow-[0_2px_8px_0_rgba(19,182,236,0.3)] hover:bg-[#0ea5d6] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {pending ? 'Enviando…' : '🔑 Resetar senha'}
                </button>
            </div>
            {!isSuperAdmin && (
                <p className="text-[11px] text-yellow-300/80">
                    Apenas SUPER_ADMIN pode resetar senha do owner.
                </p>
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
