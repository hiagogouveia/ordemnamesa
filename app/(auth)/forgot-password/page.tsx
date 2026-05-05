'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { requestPasswordResetAction } from './actions'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        await requestPasswordResetAction(email)
        setLoading(false)
        setSubmitted(true)
    }

    return (
        <div className="flex flex-1 min-h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark p-6">
            <div className="w-full max-w-[440px] flex flex-col gap-8">
                <div className="flex items-center gap-2 self-center">
                    <Logo width={40} height={40} />
                    <h2 className="text-slate-900 dark:text-white text-lg font-bold">Ordem na Mesa</h2>
                </div>

                {submitted ? (
                    <div className="flex flex-col gap-4 text-center">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Verifique seu email</h2>
                        <p className="text-slate-500 dark:text-[#93adc8]">
                            Se houver uma conta cadastrada com <strong>{email}</strong>, enviamos um link para
                            redefinir sua senha. O link expira em 1 hora.
                        </p>
                        <Link
                            href="/login"
                            className="mt-4 inline-flex items-center justify-center rounded-lg h-12 px-4 bg-primary hover:bg-[#0ea5d6] text-[#111e22] font-bold transition-colors"
                        >
                            Voltar para login
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-2 text-center">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Esqueceu a senha?</h2>
                            <p className="text-slate-500 dark:text-[#93adc8] text-sm">
                                Informe seu email e enviaremos um link para redefinir sua senha.
                            </p>
                        </div>

                        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                            <div className="flex flex-col gap-2">
                                <label htmlFor="email" className="text-slate-700 dark:text-white text-sm font-semibold">
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    required
                                    autoFocus
                                    className="rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark h-12 px-4 text-base text-slate-900 dark:text-white focus:border-primary focus:outline-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="flex w-full items-center justify-center rounded-lg h-12 bg-primary hover:bg-[#0ea5d6] text-[#111e22] font-bold transition-colors disabled:opacity-70"
                            >
                                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
                            </button>
                        </form>

                        <p className="text-center text-sm text-slate-500 dark:text-[#93adc8]">
                            <Link href="/login" className="font-semibold text-primary hover:underline">
                                Voltar para login
                            </Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
