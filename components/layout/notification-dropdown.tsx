"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/types";

function formatTimeAgo(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return "agora";
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    return `há ${Math.floor(diff / 86400)}d`;
}

const TYPE_ICONS: Record<string, string> = {
    TASK_COMPLETED_WITH_NOTE: "chat",
    NEW_TASK_ASSIGNED: "assignment_ind",
    NEW_TASK_FOR_AREA: "add_task",
};

const TYPE_COLORS: Record<string, string> = {
    TASK_COMPLETED_WITH_NOTE: "#f59e0b",
    NEW_TASK_ASSIGNED: "#13b6ec",
    NEW_TASK_FOR_AREA: "#22c55e",
};

interface NotificationDropdownProps {
    notifications: Notification[];
    unreadCount: number;
    onClose: () => void;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
}

export function NotificationDropdown({
    notifications,
    unreadCount,
    onClose,
    onMarkRead,
    onMarkAllRead,
}: NotificationDropdownProps) {
    const router = useRouter();
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

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.read) {
            onMarkRead(notification.id);
        }
        // Navegar para o contexto, se aplicável
        if (notification.related_id) {
            router.push(`/turno/atividade/${notification.related_id}`);
            onClose();
        }
    };

    return (
        <div
            ref={dropdownRef}
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
                    notifications.map((notification) => (
                        <button
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-[#16262c] ${
                                !notification.read ? "bg-[#13b6ec]/5" : ""
                            }`}
                        >
                            {/* Ícone */}
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                style={{
                                    backgroundColor: `${TYPE_COLORS[notification.type] || "#92bbc9"}15`,
                                }}
                            >
                                <span
                                    className="material-symbols-outlined text-[18px]"
                                    style={{ color: TYPE_COLORS[notification.type] || "#92bbc9" }}
                                >
                                    {TYPE_ICONS[notification.type] || "notifications"}
                                </span>
                            </div>

                            {/* Conteúdo */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <p className={`text-sm leading-tight truncate ${
                                        !notification.read ? "text-white font-semibold" : "text-[#92bbc9]"
                                    }`}>
                                        {notification.title}
                                    </p>
                                    {!notification.read && (
                                        <span className="w-2 h-2 rounded-full bg-[#13b6ec] shrink-0 mt-1.5" />
                                    )}
                                </div>
                                {notification.description && (
                                    <p className="text-[#92bbc9] text-xs mt-0.5 line-clamp-2 leading-relaxed">
                                        {notification.description}
                                    </p>
                                )}
                                <p className="text-[#325a67] text-[11px] mt-1">
                                    {formatTimeAgo(notification.created_at)}
                                </p>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
