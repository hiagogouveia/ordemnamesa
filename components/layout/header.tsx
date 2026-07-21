"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { createClient } from "@/lib/supabase/client";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useNotifications, useMarkAllNotificationsRead } from "@/lib/hooks/use-notifications";
import { NotificationDropdown } from "./notification-dropdown";

const TITLES: Record<string, string> = {
    "/dashboard": "Dashboard Geral",
    "/checklists": "Gestão de Checklists",
    "/recebimentos": "Recebimentos",
    "/equipe": "Gestão da Equipe",
    "/relatorios": "Relatórios e Análises",
    "/configuracoes": "Configurações do Sistema",
    "/turno": "Meu Turno",
    "/historico": "Histórico de Tarefas",
    "/notificacoes": "Notificações",
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
    const pathname = usePathname();
    const [userInitial, setUserInitial] = useState("U");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const { data: notifData, isLoading } = useNotifications(restaurantId || undefined);
    const markAllReadMutation = useMarkAllNotificationsRead();

    const unreadCount = notifData?.unread_count ?? 0;
    const notifications = notifData?.notifications ?? [];

    // a11y: ao fechar o dropdown (Esc, clique fora, navegação), o foco volta ao sino.
    // Sem isso, o usuário de teclado é jogado no início do documento.
    const bellRef = useRef<HTMLButtonElement>(null);
    const closeDropdown = useCallback(() => {
        setIsDropdownOpen(false);
        bellRef.current?.focus();
    }, []);

    useEffect(() => {
        async function getUser() {
            const supabase = createClient();
            const { data } = await supabase.auth.getUser();
            if (data?.user?.email) {
                setUserInitial(data.user.email.charAt(0).toUpperCase());
            }
        }
        getUser();
    }, []);

    const getHeaderTitle = () => {
        const baseRoute = "/" + pathname.split("/")[1];
        return TITLES[baseRoute] || "Ordem na Mesa";
    };

    // s90 — a marcação individual saiu daqui: quem a dispara é o NotificationNavigator,
    // e SOMENTE depois que a página de destino confirma que reconstruiu o contexto.
    const handleMarkAllRead = useCallback(() => {
        if (!restaurantId) return;
        markAllReadMutation.mutate({ restaurantId });
    }, [restaurantId, markAllReadMutation]);

    return (
        <header className="sticky top-0 z-40 w-full h-[72px] bg-[#111e22]/80 backdrop-blur-md border-b border-[#233f48] px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
                {/* Hamburger pro mobile */}
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 -ml-2 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#1a2c32] transition-colors"
                >
                    <span className="material-symbols-outlined">menu</span>
                </button>

                <div className="flex items-center gap-3">
                    <div className="lg:hidden">
                        <BrandLogo slot="header" />
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight hidden sm:block">{getHeaderTitle()}</h2>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* Sino de notificações */}
                <div className="relative">
                    <button
                        ref={bellRef}
                        type="button"
                        onClick={() => setIsDropdownOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={isDropdownOpen}
                        aria-label={
                            unreadCount > 0
                                ? `Notificações, ${unreadCount} não lidas`
                                : "Notificações"
                        }
                        className={`relative p-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] ${
                            isDropdownOpen
                                ? "text-white bg-[#1a2c32]"
                                : "text-[#92bbc9] hover:text-white hover:bg-[#1a2c32]"
                        }`}
                    >
                        <span className="material-symbols-outlined" aria-hidden="true">
                            notifications
                        </span>
                        {unreadCount > 0 && (
                            <span
                                aria-hidden="true"
                                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-black rounded-full px-1 border-2 border-[#111e22] animate-in zoom-in duration-200"
                            >
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        )}
                    </button>

                    {isDropdownOpen && (
                        <NotificationDropdown
                            notifications={notifications}
                            unreadCount={unreadCount}
                            isLoading={isLoading}
                            onClose={closeDropdown}
                            onMarkAllRead={handleMarkAllRead}
                        />
                    )}
                </div>

                <div className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full bg-[#16262c] border border-[#233f48] text-white text-sm font-bold shadow-sm">
                    {userInitial}
                </div>
            </div>
        </header>
    );
}
