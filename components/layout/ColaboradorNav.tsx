"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

export function ColaboradorNav() {
    const pathname = usePathname();

    const links = [
        { href: "/colaborador", icon: "home", label: "Início" },
        { href: "/colaborador/checklists", icon: "checklist", label: "Tarefas" },
        { href: "/colaborador/historico", icon: "history", label: "Histórico" },
        { href: "/colaborador/perfil", icon: "person", label: "Perfil" },
    ];

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-[#111e22] border-r border-slate-200 dark:border-border-dark h-screen fixed top-0 left-0 z-40">
                <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-border-dark">
                    <Link href="/colaborador" className="flex items-center gap-2">
                        <Logo width={24} height={24} />
                        <span className="font-bold text-slate-900 dark:text-white">Ordem na Mesa</span>
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
                    {links.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-slate-600 dark:text-[#93adc8] hover:bg-slate-50 dark:hover:bg-surface-dark hover:text-slate-900 dark:hover:text-white"
                                    }`}
                            >
                                <span className="material-symbols-outlined">{link.icon}</span>
                                {link.label}
                            </Link>
                        )
                    })}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-border-dark">
                    <button className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-surface-dark transition-colors text-left">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                C
                            </div>
                            <div className="flex flex-col text-sm">
                                <span className="font-bold text-slate-900 dark:text-white leading-none">Carlos</span>
                                <span className="text-xs text-slate-500 dark:text-[#5a7b88]">Cozinha</span>
                            </div>
                        </div>
                        <span className="material-symbols-outlined text-slate-400">more_vert</span>
                    </button>
                </div>
            </aside>

            {/* Mobile Header (Fixed Top) */}
            <header className="md:hidden fixed top-0 w-full bg-white dark:bg-[#111e22] border-b border-slate-200 dark:border-border-dark h-16 z-40 px-4 flex justify-between items-center transition-all">
                <div className="flex items-center gap-2">
                    <Logo width={24} height={24} />
                    <span className="font-bold text-slate-900 dark:text-white">Ordem na Mesa</span>
                </div>
                <button className="relative w-8 h-8 flex items-center justify-center text-slate-500 dark:text-[#93adc8]">
                    <span className="material-symbols-outlined">notifications</span>
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-white dark:border-[#111e22]"></span>
                </button>
            </header>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 w-full bg-white dark:bg-[#111e22] border-t border-slate-200 dark:border-border-dark z-50 pb-safe">
                <div className="flex justify-around items-center h-16">
                    {links.map((link) => {
                        const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== '/colaborador');
                        // Small exception for home link matching sub-routes, but exact match handled above
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex flex-col items-center justify-center w-full h-full transition-colors ${isActive ? 'text-primary' : 'text-slate-500 dark:text-[#557682] hover:text-slate-900 dark:hover:text-white'
                                    }`}
                            >
                                <span className={`material-symbols-outlined text-[24px] mb-0.5 ${isActive ? 'font-bold' : ''}`}>
                                    {link.icon}
                                </span>
                                <span className="text-[10px] font-medium">{link.label}</span>
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </>
    );
}
