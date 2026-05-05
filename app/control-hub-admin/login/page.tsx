import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { LoginForm } from './login-form'
import { config } from '@/lead-control-hub.config'

export const dynamic = 'force-dynamic'

export default async function ControlHubLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>
}) {
    const sp = await searchParams
    return (
        <main className="flex min-h-screen items-center justify-center bg-background-dark px-4 py-10">
            <div className="w-full max-w-md">
                <Link href="/" className="mb-8 flex items-center justify-center gap-3">
                    <Logo width={40} height={40} />
                    <span className="text-xl font-black tracking-tight text-white">
                        Ordem <span className="italic font-light text-text-secondary">na Mesa</span>
                    </span>
                </Link>

                <div className="rounded-2xl border border-border-dark bg-surface-dark p-8 shadow-2xl shadow-primary/10">
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        🔒 Control Hub
                    </span>
                    <h1 className="mt-3 text-2xl font-black text-white">{config.appName}</h1>
                    <p className="mt-1 text-sm text-text-secondary">Acesso restrito da equipe.</p>

                    {sp.error && (
                        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {sp.error}
                        </div>
                    )}

                    <div className="mt-6">
                        <LoginForm />
                    </div>
                </div>

                <p className="mt-6 text-center text-xs text-text-secondary">
                    Não é admin?{' '}
                    <Link href="/login" className="font-semibold text-primary hover:underline">
                        Login do app
                    </Link>
                </p>
            </div>
        </main>
    )
}
