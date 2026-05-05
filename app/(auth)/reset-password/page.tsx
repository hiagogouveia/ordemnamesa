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
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const supabase = createClient()

        async function check() {
            const { data } = await supabase.auth.getSession()
            if (data.session) {
                setStatus('ready')
                return
            }
            setStatus('invalid')
        }

        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
                setStatus('ready')
            }
        })

        const t = setTimeout(check, 800)
        return () => {
            clearTimeout(t)
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
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    autoFocus
                                    className="rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark h-12 px-4 text-base text-slate-900 dark:text-white focus:border-primary focus:outline-none"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label htmlFor="confirm" className="text-slate-700 dark:text-white text-sm font-semibold">
                                    Confirmar senha
                                </label>
                                <input
                                    id="confirm"
                                    type="password"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    required
                                    minLength={8}
                                    className="rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark h-12 px-4 text-base text-slate-900 dark:text-white focus:border-primary focus:outline-none"
                                />
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
