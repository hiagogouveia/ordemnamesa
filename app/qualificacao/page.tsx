import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { LeadForm } from '@/components/lead-form'

export const metadata = {
    title: 'Qualifique seu restaurante',
    description: 'Solicite acesso ao Ordem na Mesa. Nosso time entra em contato pelo WhatsApp.',
}

export default function QualificacaoPage() {
    return (
        <main className="min-h-screen bg-background-dark">
            <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
                <header className="mb-8 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <Logo width={36} height={36} />
                        <span className="text-lg font-black tracking-tight text-white">
                            Ordem <span className="italic font-light text-text-secondary">na Mesa</span>
                        </span>
                    </Link>
                    <Link
                        href="/login"
                        className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10 hover:text-white"
                    >
                        Entrar
                    </Link>
                </header>

                <div className="grid flex-1 items-center gap-10 lg:grid-cols-2">
                    <div className="hidden lg:block">
                        <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                            ⚡ 30 dias grátis após aprovação
                        </span>
                        <h1 className="mt-4 text-4xl font-black leading-[1.1] text-white xl:text-5xl">
                            Operação organizada,{' '}
                            <span className="text-primary">equipe alinhada</span>.
                        </h1>
                        <p className="mt-4 max-w-md text-lg text-text-secondary">
                            Checklists digitais, escala por turno e listas de compras num só lugar.
                            Conte um pouco sobre seu restaurante e nosso time entra em contato pelo WhatsApp.
                        </p>

                        <ul className="mt-8 space-y-3 text-sm text-text-secondary">
                            <Bullet>Checklists com foto, ordem e tarefas críticas</Bullet>
                            <Bullet>Acompanhamento em tempo real do turno</Bullet>
                            <Bullet>Multi-unidade com isolamento por restaurante</Bullet>
                            <Bullet>Suporte humano via WhatsApp</Bullet>
                        </ul>
                    </div>

                    <div className="flex justify-center lg:justify-end">
                        <LeadForm />
                    </div>
                </div>
            </div>
        </main>
    )
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
            <span>{children}</span>
        </li>
    )
}
