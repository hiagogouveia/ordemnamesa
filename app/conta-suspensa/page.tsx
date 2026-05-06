import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { config } from '@/lead-control-hub.config'

export const dynamic = 'force-dynamic'
export const metadata = {
    title: 'Conta suspensa — Ordem na Mesa',
    robots: { index: false, follow: false },
}

export default function ContaSuspensaPage() {
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'contato@ordemnamesa.com'
    const whatsapp = config.whatsappAdminNumber
    const whatsappLink = whatsapp
        ? `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
              'Olá! Minha conta no Ordem na Mesa foi suspensa e preciso de ajuda.'
          )}`
        : null

    return (
        <div className="flex min-h-screen items-center justify-center bg-background-dark px-4 text-white">
            <div className="w-full max-w-md space-y-6 rounded-2xl border border-border-dark bg-surface-dark p-8 text-center shadow-2xl">
                <div className="flex justify-center">
                    <Logo width={48} height={48} />
                </div>
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
                        ⛔ Conta suspensa
                    </div>
                    <h1 className="mt-3 text-2xl font-black">Acesso temporariamente bloqueado</h1>
                    <p className="mt-2 text-sm text-text-secondary">
                        A sua conta no <strong className="text-white">{config.appName}</strong>{' '}
                        está com acesso suspenso. Para reativar, entre em contato com nosso time
                        comercial.
                    </p>
                </div>

                <div className="space-y-2 rounded-xl border border-border-dark bg-surface-deep p-4 text-left text-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                        Como podemos ajudar
                    </div>
                    <a
                        href={`mailto:${supportEmail}`}
                        className="block rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-white hover:border-primary/40"
                    >
                        ✉️ {supportEmail}
                    </a>
                    {whatsappLink && (
                        <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success hover:bg-success/20"
                        >
                            💬 Falar no WhatsApp
                        </a>
                    )}
                </div>

                <form action="/api/auth/signout" method="post">
                    <button
                        type="submit"
                        className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-bold text-[#111e22] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] hover:bg-[#0ea5d6]"
                    >
                        Sair / Trocar de conta
                    </button>
                </form>

                <p className="text-[11px] text-text-secondary">
                    Se você acredita que isso é um engano, anote o horário e entre em contato.{' '}
                    <Link href="/login" className="text-primary hover:underline">
                        Voltar ao login
                    </Link>
                </p>
            </div>
        </div>
    )
}
