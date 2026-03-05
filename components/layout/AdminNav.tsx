"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";

export function AdminNav() {
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const links = [
        { href: "/admin", icon: "dashboard", label: "Dashboard" },
        { href: "/admin/checklists", icon: "checklist", label: "Checklists" },
        { href: "/admin/relatorios", icon: "monitoring", label: "Relatórios" },
        { href: "/admin/colaboradores", icon: "group", label: "Colaboradores" },
        { href: "/admin/configuracoes", icon: "settings", label: "Configurações" },
    ];

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className={`fixed top-0 left-0 z-40 h-screen transition-transform transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 w-64 bg-[#111e22] border-r border-[#233f48] flex flex-col`}>
                {/* Sidebar Header */}
                <div className="h-16 flex items-center px-6 border-b border-[#233f48] shrink-0">
                    <Link href="/admin" className="flex items-center gap-2">
                        <Logo width={24} height={24} />
                        <span className="font-bold text-white text-lg tracking-tight pb-0.5">Ordem na Mesa</span>
                    </Link>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden ml-auto text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Sidebar Menu */}
                <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1.5 custom-scrollbar">
                    {links.map((link) => {
                        const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== '/admin');
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all group ${isActive
                                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                                        : 'text-[#93adc8] hover:bg-[#1a2c32] hover:text-white'
                                    }`}
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <span className={`material-symbols-outlined ${isActive ? 'text-white' : 'text-[#557682] group-hover:text-primary transition-colors'}`}>
                                    {link.icon}
                                </span>
                                {link.label}
                            </Link>
                        )
                    })}
                </div>
            </aside>

            {/* Mobile overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-[#111e22]/80 backdrop-blur-sm z-30 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                ></div>
            )}

            {/* Top Header */}
            <header className="fixed top-0 right-0 left-0 md:left-64 h-16 bg-white dark:bg-[#111e22] border-b border-slate-200 dark:border-[#233f48] z-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-all">
                {/* Mobile Menu Button */}
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-[#93adc8] hover:bg-slate-100 dark:hover:bg-[#1a2c32] transition-colors"
                >
                    <span className="material-symbols-outlined">menu</span>
                </button>

                {/* Context Path / Quick actions */}
                <div className="hidden md:flex items-center text-sm font-medium text-slate-500 dark:text-[#93adc8]">
                    <span className="material-symbols-outlined text-[20px] mr-2">storefront</span>
                    Unidade Centro
                </div>

                {/* Header Right */}
                <div className="flex items-center gap-3 sm:gap-5">
                    <button className="relative w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-[#93adc8] hover:bg-slate-100 dark:hover:bg-[#1a2c32] transition-colors">
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-red-500 border border-white dark:border-[#111e22]"></span>
                    </button>
                    <div className="h-8 w-px bg-slate-200 dark:bg-[#233f48]"></div>
                    <button className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left">
                        <div className="hidden sm:flex flex-col items-end">
                            <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Mariana S.</span>
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#557682] font-bold">Gerente</span>
                        </div>
                        <div className="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-[#233f48] bg-slate-100" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/women/44.jpg')", backgroundSize: 'cover' }}></div>
                    </button>
                </div>
            </header>
        </>
    );
}
