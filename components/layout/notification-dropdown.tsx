"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { AnyNotification } from "@/lib/notifications/contract";
import { useNotificationNavigator } from "@/lib/notifications/navigator";
import { NotificationList } from "@/components/notifications/notification-list";

interface NotificationDropdownProps {
    notifications: AnyNotification[];
    unreadCount: number;
    isLoading?: boolean;
    onClose: () => void;
    onMarkAllRead: () => void;
}

export function NotificationDropdown({
    notifications,
    unreadCount,
    isLoading,
    onClose,
    onMarkAllRead,
}: NotificationDropdownProps) {
    const { navigate } = useNotificationNavigator();
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fechar ao clicar fora
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    /**
     * Acessibilidade: o dropdown era 100% inoperável por teclado — nenhum `onKeyDown`,
     * nenhum `role`, nenhum `aria-label`. Agora: Esc fecha (e devolve o foco ao sino),
     * setas percorrem os itens, Home/End vão às pontas.
     */
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (!dropdownRef.current) return;

            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
                return;
            }

            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;

            const items = Array.from(
                dropdownRef.current.querySelectorAll<HTMLElement>(
                    '[role="menuitem"]:not([disabled])',
                ),
            );
            if (items.length === 0) return;

            e.preventDefault();
            const current = items.indexOf(document.activeElement as HTMLElement);

            const next =
                e.key === "Home" ? 0
                : e.key === "End" ? items.length - 1
                : e.key === "ArrowDown" ? (current + 1) % items.length
                : (current - 1 + items.length) % items.length;

            items[next]?.focus();
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    /**
     * O componente NÃO decide o destino e NÃO marca como lida. Ele só pede a navegação
     * ao NotificationNavigator; a leitura é confirmada pela PÁGINA DE DESTINO, depois de
     * reconstruir o contexto (handshake causal, sem timeout).
     */
    const handleSelect = (n: AnyNotification) => {
        const { navigated } = navigate(n);
        if (navigated) onClose();
    };

    return (
        <div
            ref={dropdownRef}
            role="menu"
            aria-label="Notificações"
            className="absolute top-full right-0 mt-2 w-[380px] max-w-[calc(100vw-2rem)] bg-[#1a2c32] border border-[#233f48] rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
            <div className="px-4 py-3 border-b border-[#233f48] flex items-center justify-between gap-2">
                <h3 className="text-white font-bold text-sm">
                    Notificações
                    {unreadCount > 0 && (
                        <span className="ml-2 text-[#13b6ec] font-medium">{unreadCount}</span>
                    )}
                </h3>
                {unreadCount > 0 && (
                    <button
                        type="button"
                        onClick={onMarkAllRead}
                        className="text-[#13b6ec] text-xs font-medium hover:text-[#10a1d4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] rounded px-1"
                    >
                        Marcar todas como lidas
                    </button>
                )}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
                {isLoading && notifications.length === 0 ? (
                    <div className="p-4 flex flex-col gap-3" aria-busy="true">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex gap-3">
                                <div className="w-9 h-9 rounded-full bg-[#233f48] animate-pulse shrink-0" />
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="h-3 w-2/3 rounded bg-[#233f48] animate-pulse" />
                                    <div className="h-3 w-full rounded bg-[#233f48] animate-pulse" />
                                </div>
                            </div>
                        ))}
                        <span className="sr-only">Carregando notificações…</span>
                    </div>
                ) : (
                    <NotificationList notifications={notifications} onSelect={handleSelect} />
                )}
            </div>

            <div className="border-t border-[#233f48] px-4 py-2.5">
                <Link
                    href="/notificacoes"
                    onClick={onClose}
                    className="block text-center text-[#13b6ec] text-xs font-medium hover:text-[#10a1d4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] rounded py-1"
                >
                    Ver todas
                </Link>
            </div>
        </div>
    );
}
