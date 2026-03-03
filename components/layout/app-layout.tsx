"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Rotas que não devem exibir o layout do painel interno
    const isNoLayoutRoute = pathname === "/selecionar-restaurante" || pathname === "/login" || pathname === "/cadastro";

    if (isNoLayoutRoute) {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen overflow-hidden bg-[#101d22] font-sans">
            {/* Overlay para Mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}
            <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
            <div className="flex flex-col flex-1 min-w-0 h-full relative">
                <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
                <main className="flex-1 overflow-x-hidden overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
