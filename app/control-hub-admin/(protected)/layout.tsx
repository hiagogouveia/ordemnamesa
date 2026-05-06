import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { config } from '@/lead-control-hub.config'
import { LogoutLink } from '../logout-link'

export const dynamic = 'force-dynamic'

export default async function ControlHubAdminProtectedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const guard = await requireStaff()
    if ('error' in guard) {
        redirect(`${config.panelBasePath}/login?error=${encodeURIComponent(guard.error)}`)
    }

    return (
        <div className="min-h-screen bg-background-dark text-white">
            <header className="border-b border-border-dark bg-surface-deep/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-6">
                        <Link href={`${config.panelBasePath}/leads`} className="flex items-center gap-3">
                            <Logo width={32} height={32} />
                            <div className="leading-tight">
                                <div className="text-sm font-black text-white">
                                    Ordem <span className="italic font-light text-text-secondary">na Mesa</span>
                                </div>
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                                    Control Hub
                                </div>
                            </div>
                        </Link>
                        <nav className="hidden gap-1 sm:flex">
                            <NavLink href={`${config.panelBasePath}/leads`}>Leads</NavLink>
                            <NavLink href={`${config.panelBasePath}/restaurants`}>Restaurantes</NavLink>
                            <NavLink href={`${config.panelBasePath}/staff`}>Staff</NavLink>
                            <NavLink href={`${config.panelBasePath}/logs`}>Logs</NavLink>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-text-secondary sm:inline">{guard.ctx.user.email}</span>
                        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            {guard.ctx.role}
                        </span>
                        <LogoutLink />
                    </div>
                </div>
                <nav className="flex gap-1 overflow-x-auto border-t border-border-dark bg-background-dark/40 px-4 py-2 sm:hidden">
                    <NavLink href={`${config.panelBasePath}/leads`}>Leads</NavLink>
                    <NavLink href={`${config.panelBasePath}/restaurants`}>Restaurantes</NavLink>
                    <NavLink href={`${config.panelBasePath}/staff`}>Staff</NavLink>
                    <NavLink href={`${config.panelBasePath}/logs`}>Logs</NavLink>
                </nav>
            </header>
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
    )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-dark hover:text-white"
        >
            {children}
        </Link>
    )
}
