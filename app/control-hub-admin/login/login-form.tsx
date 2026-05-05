'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const inputClass =
    'flex w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 ' +
    'dark:border-border-dark dark:bg-surface-dark dark:text-white dark:placeholder:text-[#5a7b88] ' +
    'h-12 lg:h-14 px-4 text-base font-normal leading-normal shadow-sm transition-all ' +
    'focus:border-primary focus:outline-0 focus:ring-0 dark:focus:border-primary'

export function LoginForm() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const supabase = createClient()
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
            if (signInError) {
                setError('Credenciais inválidas.')
                return
            }
            router.push('/control-hub-admin/leads')
            router.refresh()
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-text-secondary">E-mail</span>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                    className={inputClass}
                />
            </label>

            <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-text-secondary">Senha</span>
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        className={`${inputClass} pr-12`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-primary"
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                        {showPassword ? '🙈' : '👁️'}
                    </button>
                </div>
            </label>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-base font-bold tracking-[0.015em] text-[#111e22] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] transition-all duration-200 hover:bg-[#0ea5d6] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 lg:h-14"
            >
                {loading ? 'Entrando…' : 'Entrar'}
            </button>
        </form>
    )
}
