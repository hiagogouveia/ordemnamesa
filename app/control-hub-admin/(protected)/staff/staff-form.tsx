'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { addStaffAction } from './actions'
import type { StaffRole } from '@/lib/admin-leads-control-hub/staff'

const inputClass =
    'flex w-full rounded-lg border border-border-dark bg-surface-deep text-white placeholder:text-[#5a7b88] ' +
    'h-11 px-3 text-sm font-normal shadow-sm transition-all focus:border-primary focus:outline-0 focus:ring-0'

export function StaffForm() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<StaffRole>('SUPPORT_AGENT')
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        start(async () => {
            const r = await addStaffAction(email, role)
            if (r.error) setError(r.error)
            else {
                setEmail('')
                router.refresh()
            }
        })
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1">
                <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
                    E-mail (já cadastrado em auth.users)
                </span>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClass}
                />
            </label>
            <label>
                <span className="mb-1.5 block text-xs font-semibold text-text-secondary">Role</span>
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as StaffRole)}
                    className={inputClass}
                >
                    <option value="SUPPORT_AGENT">SUPPORT_AGENT</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
            </label>
            <button
                type="submit"
                disabled={pending}
                className="h-11 rounded-lg bg-primary px-5 text-sm font-bold text-[#111e22] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] transition-all hover:bg-[#0ea5d6] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
                {pending ? 'Adicionando…' : 'Adicionar'}
            </button>
            {error && (
                <div className="basis-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}
        </form>
    )
}
