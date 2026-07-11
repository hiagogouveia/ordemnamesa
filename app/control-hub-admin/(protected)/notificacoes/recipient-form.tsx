'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { addRecipientAction } from './actions'
import { ADMIN_NOTIFICATION_EVENTS } from '@/lib/admin-notifications/events-catalog'
import { Checkbox } from '@/components/ui/checkbox'

const inputClass =
    'flex w-full rounded-lg border border-border-dark bg-surface-deep text-white placeholder:text-[#5a7b88] ' +
    'h-11 px-3 text-sm font-normal shadow-sm transition-all focus:border-primary focus:outline-0 focus:ring-0'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RecipientForm() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [label, setLabel] = useState('')
    const [events, setEvents] = useState<string[]>(ADMIN_NOTIFICATION_EVENTS.map((e) => e.value))
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()

    const emailInvalid = email.length > 0 && !EMAIL_RE.test(email.trim())

    function toggleEvent(value: string) {
        setEvents((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]))
    }

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        if (!EMAIL_RE.test(email.trim())) {
            setError('E-mail inválido.')
            return
        }
        start(async () => {
            const r = await addRecipientAction(email, label, events)
            if (r.error) setError(r.error)
            else {
                setEmail('')
                setLabel('')
                setEvents(ADMIN_NOTIFICATION_EVENTS.map((ev) => ev.value))
                router.refresh()
            }
        })
    }

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[220px] flex-1">
                    <span className="mb-1.5 block text-xs font-semibold text-text-secondary">E-mail</span>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="comercial@empresa.com"
                        className={`${inputClass} ${emailInvalid ? 'border-red-500/60' : ''}`}
                    />
                    {emailInvalid && <span className="mt-1 block text-xs text-red-300">Formato de e-mail inválido.</span>}
                </label>
                <label className="min-w-[160px] flex-1">
                    <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
                        Nome / descrição <span className="text-text-secondary/60">(opcional)</span>
                    </span>
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Comercial, Diretor…"
                        className={inputClass}
                    />
                </label>
            </div>

            <div>
                <span className="mb-2 block text-xs font-semibold text-text-secondary">Eventos</span>
                <div className="flex flex-wrap gap-4">
                    {ADMIN_NOTIFICATION_EVENTS.map((ev) => (
                        <label key={ev.value} className="flex cursor-pointer items-center gap-2 text-sm text-white">
                            <Checkbox
                                checked={events.includes(ev.value)}
                                onChange={() => toggleEvent(ev.value)}
                            />
                            {ev.label}
                        </label>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={pending || emailInvalid}
                    className="h-11 rounded-lg bg-primary px-5 text-sm font-bold text-[#111e22] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] transition-all hover:bg-[#0ea5d6] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {pending ? 'Adicionando…' : 'Adicionar destinatário'}
                </button>
                {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {error}
                    </div>
                )}
            </div>
        </form>
    )
}
