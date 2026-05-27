'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { createClient } from '@/lib/supabase/client'

type Status = 'checking' | 'ready' | 'invalid' | 'saving' | 'done'

export default function ResetPasswordPage() {
    const router = useRouter()
    const [status, setStatus] = useState<Status>('checking')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const supabase = createClient()
        let cancelled = false

        async function init() {
            const url = new URL(window.location.href)
            const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))

            const queryError = url.searchParams.get('error_description') || url.searchParams.get('error')
            const hashError = hashParams.get('error_description') || hashParams.get('error')
            const code = url.searchParams.get('code')
            const accessToken = hashParams.get('access_token')
            const refreshToken = hashParams.get('refresh_token')

            if (queryError || hashError) {
                if (cancelled) return
                setError(queryError || hashError)
                setStatus('invalid')
                return
            }

            if (accessToken && refreshToken) {
                const { error: setErr } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                })
                if (cancelled) return
                if (setErr) {
                    setError(setErr.message)
                    setStatus('invalid')
                    return
                }
                window.history.replaceState({}, '', url.pathname)
                setStatus('ready')
                return
            }

            if (code) {
                const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
                if (cancelled) return
                if (exErr) {
                    setError(exErr.message)
                    setStatus('invalid')
                    return
                }
                window.history.replaceState({}, '', url.pathname)
                setStatus('ready')
                return
            }

            const { data } = await supabase.auth.getSession()
            if (cancelled) return
            if (data.session) {
                setStatus('ready')
                return
            }
            setStatus('invalid')
        }

        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
                setStatus('ready')
                setError(null)
            }
        })

        init()
        return () => {
            cancelled = true
            sub.subscription.unsubscribe()
        }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (password.length < 8) {
            setError('A senha precisa ter pelo menos 8 caracteres.')
            return
        }
        if (password !== confirm) {
            setError('As senhas não conferem.')
            return
        }
        setStatus('saving')
        const supabase = createClient()
        const { error: updErr } = await supabase.auth.updateUser({ password })
        if (updErr) {
            setError(updErr.message)
            setStatus('ready')
            return
        }
        setStatus('done')
        setTimeout(() => router.push('/login'), 2000)
    }

    return (
        <div className="flex flex-1 min-h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark p-6">
            <div className="w-full max-w-[440px] flex flex-col gap-8">
                <div className="flex items-center gap-2 self-center">
                    <Logo width={40} height={40} />
                    <h2 className="text-slate-900 dark:text-white text-lg font-bold">Ordem na Mesa</h2>
                </div>

                {status === 'checking' && (
                    <p className="text-center text-slate-500 dark:text-[#93adc8]">Validando link...</p>
                )}

                {status === 'invalid' && (
                    <div className="flex flex-col gap-4 text-center">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Link inválido ou expirado</h2>
                        <p className="text-slate-500 dark:text-[#93adc8]">
                            Solicite um novo link para redefinir sua senha.
                        </p>
                        {error && (
                            <p className="text-xs text-red-400 break-words">Detalhe técnico: {error}</p>
                        )}
                        <Link
                            href="/forgot-password"
                            className="mt-2 inline-flex items-center justify-center rounded-lg h-12 px-4 bg-primary hover:bg-[#0ea5d6] text-[#111e22] font-bold transition-colors"
                        >
                            Solicitar novo link
                        </Link>
                    </div>
                )}

                {status === 'done' && (
                    <div className="flex flex-col gap-3 text-center">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Senha redefinida</h2>
                        <p className="text-slate-500 dark:text-[#93adc8]">Redirecionando para o login...</p>
                    </div>
                )}

                {(status === 'ready' || status === 'saving') && (
                    <>
                        <div className="flex flex-col gap-2 text-center">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Definir nova senha</h2>
                            <p className="text-slate-500 dark:text-[#93adc8] text-sm">
                                Escolha uma senha forte com pelo menos 8 caracteres.
                            </p>
                        </div>

                        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                            <div className="flex flex-col gap-2">
                                <label htmlFor="password" className="text-slate-700 dark:text-white text-sm font-semibold">
                                    Nova senha
                                </label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        autoFocus
                                        className="w-full rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark h-12 pl-4 pr-12 text-base text-slate-900 dark:text-white focus:border-primary focus:outline-none"
                                    />
                                    <PasswordToggle
                                        visible={showPassword}
                                        onToggle={() => setShowPassword((v) => !v)}
                                        targetId="password"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label htmlFor="confirm" className="text-slate-700 dark:text-white text-sm font-semibold">
                                    Confirmar senha
                                </label>
                                <div className="relative">
                                    <input
                                        id="confirm"
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value)}
                                        required
                                        minLength={8}
                                        className="w-full rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark h-12 pl-4 pr-12 text-base text-slate-900 dark:text-white focus:border-primary focus:outline-none"
                                    />
                                    <PasswordToggle
                                        visible={showConfirm}
                                        onToggle={() => setShowConfirm((v) => !v)}
                                        targetId="confirm"
                                    />
                                </div>
                            </div>

                            {error && <p className="text-red-500 text-sm">{error}</p>}

                            <button
                                type="submit"
                                disabled={status === 'saving'}
                                className="flex w-full items-center justify-center rounded-lg h-12 bg-primary hover:bg-[#0ea5d6] text-[#111e22] font-bold transition-colors disabled:opacity-70"
                            >
                                {status === 'saving' ? 'Salvando...' : 'Salvar nova senha'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}

function PasswordToggle({
    visible,
    onToggle,
    targetId,
}: {
    visible: boolean
    onToggle: () => void
    targetId: string
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={visible}
            aria-controls={targetId}
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-700 dark:text-[#93adc8] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            tabIndex={0}
        >
            {visible ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
            ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            )}
        </button>
    )
}
