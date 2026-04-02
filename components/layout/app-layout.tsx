"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useNotifications, useMarkNotificationRead } from "@/lib/hooks/use-notifications";

function PasswordChangedBanner({ restaurantId }: { restaurantId: string }) {
    const { data } = useNotifications(restaurantId);
    const markRead = useMarkNotificationRead();
    const [dismissedId, setDismissedId] = useState<string | null>(null);

    const notification = data?.notifications.find(
        (n) => n.type === 'PASSWORD_CHANGED_BY_ADMIN' && !n.read
    ) ?? null;

    // Disparar marcação de lida quando a notificação aparecer
    useEffect(() => {
        if (!notification || dismissedId === notification.id) return;
        if (markRead.isPending) return;

        setDismissedId(notification.id);
        markRead.mutate({ notificationId: notification.id, restaurantId });
    }, [notification, restaurantId, dismissedId, markRead]);

    if (!notification || dismissedId !== notification.id) return null;

    return (
        <div className="flex items-center justify-center gap-3 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-sm text-amber-300">
            <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
            <span>Sua senha foi redefinida por um gestor. Se não foi você, contate o responsável.</span>
        </div>
    );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const userRole = useRestaurantStore((state) => state.userRole);
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Rotas que não devem exibir o layout do painel interno
    const isNoLayoutRoute =
        pathname === "/selecionar-restaurante" ||
        pathname === "/login" ||
        pathname === "/cadastro";

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

            <div className={`flex flex-col flex-1 min-w-0 h-full relative ${userRole === 'staff' ? 'pb-16 lg:pb-0' : ''}`}>
                <Header onMenuClick={() => setIsMobileMenuOpen(true)} />

                {restaurantId && <PasswordChangedBanner restaurantId={restaurantId} />}

                <main className="flex-1 overflow-x-hidden overflow-y-auto">
                    {children}
                </main>

                {/* Bottom Navigation Mobile (Staff) */}
                {userRole === 'staff' && (
                    <div className="lg:hidden fixed bottom-0 left-0 right-0 w-full bg-[#111e22] border-t border-[#233f48] px-6 py-4 flex justify-between items-center z-40 pb-safe">
                        <Link href="/historico" className={`flex flex-col items-center gap-1 transition-colors ${pathname.startsWith('/historico') ? 'text-[#13b6ec]' : 'text-[#92bbc9] hover:text-[#13b6ec]'}`}>
                            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: pathname.startsWith('/historico') ? "'FILL' 1" : "'FILL' 0" }}>history</span>
                            <span className="text-[10px] font-medium uppercase">Histórico</span>
                        </Link>

                        <Link href="/turno" className={`flex flex-col items-center gap-1 transition-colors ${Object.is(pathname, '/turno') ? 'text-[#13b6ec]' : 'text-[#92bbc9] hover:text-[#13b6ec]'}`}>
                            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: pathname === '/turno' ? "'FILL' 1" : "'FILL' 0" }}>fact_check</span>
                            <span className="text-[10px] font-medium uppercase">Turno Atual</span>
                        </Link>

                        <button className="flex flex-col items-center gap-1 text-[#92bbc9] hover:text-red-400 transition-colors">
                            <span className="material-symbols-outlined text-2xl">warning</span>
                            <span className="text-[10px] font-medium uppercase">Incidente</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
