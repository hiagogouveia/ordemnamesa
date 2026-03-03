"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Rotas que não devem exibir o layout do painel interno
    const isNoLayoutRoute = pathname === "/selecionar-restaurante" || pathname === "/login" || pathname === "/cadastro";

    if (isNoLayoutRoute) {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen overflow-hidden bg-[#101d22] font-sans">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0 h-full relative">
                <Header />
                <main className="flex-1 overflow-x-hidden overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
