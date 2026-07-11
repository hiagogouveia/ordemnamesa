'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { ADMIN_NOTIFICATION_EVENTS } from '@/lib/admin-notifications/events-catalog'
import {
    toggleRecipientAction,
    removeRecipientAction,
    updateRecipientSubscriptionsAction,
    sendTestEmailAction,
} from './actions'

interface Props {
    recipientId: string
    active: boolean
    events: string[]
}

export function RecipientRowActions({ recipientId, active, events }: Props) {
    const router = useRouter()
    const [pending, start] = useTransition()
    const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

    function run(fn: () => Promise<{ ok?: boolean; error?: string }>, okText?: string) {
        setFeedback(null)
        start(async () => {
            const r = await fn()
            if (r.error) setFeedback({ kind: 'error', text: r.error })
            else {
                if (okText) setFeedback({ kind: 'ok', text: okText })
                router.refresh()
            }
        })
    }

    function toggleEvent(value: string) {
        const next = events.includes(value) ? events.filter((e) => e !== value) : [...events, value]
        run(() => updateRecipientSubscriptionsAction(recipientId, next))
    }

    function handleRemove() {
        if (!confirm('Remover este destinatário? As inscrições dele também serão removidas.')) return
        run(() => removeRecipientAction(recipientId))
    }

    return (
        <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-4">
                <Switch
                    checked={active}
                    disabled={pending}
                    onChange={(e) => run(() => toggleRecipientAction(recipientId, e.target.checked))}
                    aria-label={active ? 'Desativar destinatário' : 'Ativar destinatário'}
                />
                <div className="flex items-center gap-3">
                    {ADMIN_NOTIFICATION_EVENTS.map((ev) => (
                        <label key={ev.value} className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                            <Checkbox
                                checked={events.includes(ev.value)}
                                disabled={pending}
                                onChange={() => toggleEvent(ev.value)}
                            />
                            {ev.label}
                        </label>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => run(() => sendTestEmailAction(recipientId), 'E-mail de teste enviado.')}
                    disabled={pending}
                    className="text-xs font-semibold text-primary transition-colors hover:text-[#0ea5d6] hover:underline disabled:opacity-60"
                >
                    {pending ? '…' : 'Enviar teste'}
                </button>
                <button
                    type="button"
                    onClick={handleRemove}
                    disabled={pending}
                    className="text-xs font-semibold text-red-300 transition-colors hover:text-red-200 hover:underline disabled:opacity-60"
                >
                    Remover
                </button>
            </div>
            {feedback && (
                <span className={feedback.kind === 'ok' ? 'text-xs text-emerald-300' : 'text-xs text-red-300'}>
                    {feedback.text}
                </span>
            )}
        </div>
    )
}
