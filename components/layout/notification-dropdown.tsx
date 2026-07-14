"use client";

import { useRef, useEffect } from "react";
import type { AnyNotification } from "@/lib/notifications/contract";
import { resolveNavigationTarget, targetToHref } from "@/lib/notifications/navigation";
import { useNotificationNavigator } from "@/lib/notifications/navigator";
import { colorFor, iconFor } from "@/lib/notifications/registry";

function formatTimeAgo(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return "agora";
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    return `há ${Math.floor(diff / 86400)}d`;
}

interface NotificationDropdownProps {
    notifications: AnyNotification[];
    unreadCount: number;
    onClose: () => void;
    onMarkAllRead: () => void;
}

export function NotificationDropdown({
    notifications,
    unreadCount,
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
     * s90 — o componente NÃO decide para onde ir, e NÃO marca como lida.
     *
     * Antes: um if/else hardcoded aqui mandava BLOCKED_ROUTINE para '/checklists' (tela
     * genérica) e qualquer `related_id` para '/turno/atividade/<id>' — a tela do
     * COLABORADOR, errada para o gestor. E marcava como lida imediatamente, mesmo quando
     * a navegação não levava a lugar nenhum.
     *
     * Agora o `navigate` do NotificationNavigator resolve a intenção a partir do contrato
     * e executa. A leitura só é marcada quando a PÁGINA DE DESTINO confirma que
     * reconstruiu o contexto (handshake causal, sem timeout).
     */
    const handleNotificationClick = (notification: AnyNotification) => {
        const { navigated } = navigate(notification);
        if (navigated) onClose();
    };

    return (
        <div
            ref={dropdownRef}
            role="menu"
            aria-label="Notificações"
            className="absolute top-full right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-[#1a2c32] border border-[#233f48] rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
            {/* Header do dropdown */}
            <div className="px-4 py-3 border-b border-[#233f48] flex items-center justify-between">
                <h3 className="text-white font-bold text-sm">Notificações</h3>
                {unreadCount > 0 && (
                    <button
                        onClick={onMarkAllRead}
                        className="text-[#13b6ec] text-xs font-medium hover:text-[#10a1d4] transition-colors"
                    >
                        Marcar todas como lidas
                    </button>
                )}
            </div>

            {/* Lista */}
            <div className="max-h-[400px] overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="py-12 flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-[#325a67] text-4xl">notifications_off</span>
                        <p className="text-[#92bbc9] text-sm">Nenhuma notificação</p>
                    </div>
                ) : (
                    notifications.map((notification) => {
                        const href = targetToHref(
                            resolveNavigationTarget(notification),
                            notification.id,
                        );
                        const icon = iconFor(notification.type);
                        const color = colorFor(notification.type);

                        return (
                            <button
                                key={notification.id}
                                role="menuitem"
                                onClick={() => handleNotificationClick(notification)}
                                disabled={!href}
                                aria-disabled={!href}
                                aria-label={`${notification.title}${notification.read ? "" : " (não lida)"}`}
                                className={`w-full text-left px-4 py-3 flex gap-3 transition-colors ${
                                    href ? "hover:bg-[#16262c] cursor-pointer" : "cursor-default"
                                } ${!notification.read ? "bg-[#13b6ec]/5" : ""}`}
                            >
                                {/* Ícone — identidade visual por tipo, vinda do registry */}
                                <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${color}15` }}
                                >
                                    <span
                                        className="material-symbols-outlined text-[18px]"
                                        style={{ color }}
                                        aria-hidden="true"
                                    >
                                        {icon}
                                    </span>
                                </div>

                                {/* Conteúdo */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <p
                                            className={`text-sm leading-tight truncate ${
                                                !notification.read
                                                    ? "text-white font-semibold"
                                                    : "text-[#92bbc9]"
                                            }`}
                                        >
                                            {notification.title}
                                        </p>
                                        {!notification.read && (
                                            <span
                                                className="w-2 h-2 rounded-full bg-[#13b6ec] shrink-0 mt-1.5"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </div>
                                    {notification.description && (
                                        <p className="text-[#92bbc9] text-xs mt-0.5 line-clamp-2 leading-relaxed">
                                            {notification.description}
                                        </p>
                                    )}
                                    <time
                                        dateTime={notification.created_at}
                                        className="text-[#325a67] text-[11px] mt-1 block"
                                    >
                                        {formatTimeAgo(notification.created_at)}
                                    </time>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
