"use client";

import { useMemo, useState } from "react";
import type { AnyNotification, NotificationPriority } from "@/lib/notifications/contract";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import {
    useMarkAllNotificationsRead,
    useNotifications,
} from "@/lib/hooks/use-notifications";
import { useNotificationNavigator } from "@/lib/notifications/navigator";
import { NotificationList } from "@/components/notifications/notification-list";

type Filter = "all" | "unread" | "critical";

const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "unread", label: "Não lidas" },
    { id: "critical", label: "Prioritárias" },
];

const HIGH_PRIORITIES: NotificationPriority[] = ["critical", "high"];

/**
 * A Central de Notificações completa.
 *
 * Não existia — só havia o dropdown do sino, com um `limit=30` hardcoded, sem filtros e
 * sem "ver todas". No mobile, onde o dropdown é apertado, isso deixava o gestor sem
 * caminho nenhum para o histórico.
 */
export default function NotificacoesPage() {
    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const userRole = useRestaurantStore((s) => s.userRole);

    const { data, isLoading } = useNotifications(restaurantId ?? undefined);
    const markAllRead = useMarkAllNotificationsRead();
    const { navigate } = useNotificationNavigator();

    const [filter, setFilter] = useState<Filter>("all");

    const notifications = useMemo(() => {
        const all = data?.notifications ?? [];
        if (filter === "unread") return all.filter((n) => !n.read);
        if (filter === "critical") return all.filter((n) => HIGH_PRIORITIES.includes(n.priority));
        return all;
    }, [data?.notifications, filter]);

    const unreadCount = data?.unread_count ?? 0;

    // A Central é ferramenta de gestão; `/checklists` (o destino de todo deep-link)
    // bloqueia staff. Melhor dizer isso do que levar o colaborador a um muro.
    if (userRole === "staff") {
        return (
            <div className="p-6 flex flex-col items-center justify-center text-center gap-2 h-full">
                <span className="material-symbols-outlined text-4xl text-[#325a67]" aria-hidden="true">
                    notifications_off
                </span>
                <h1 className="text-white font-bold">Notificações</h1>
                <p className="text-[#92bbc9] text-sm max-w-sm">
                    As notificações operacionais são direcionadas aos gestores. Suas
                    atividades ficam em <strong className="text-white">Meu Turno</strong>.
                </p>
            </div>
        );
    }

    const handleSelect = (n: AnyNotification) => navigate(n);

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
            <div className="flex items-center justify-between gap-3 mb-4">
                <h1 className="text-xl md:text-2xl font-bold text-white">
                    Notificações
                    {unreadCount > 0 && (
                        <span className="ml-2 text-[#13b6ec] text-base font-medium">
                            {unreadCount} não lidas
                        </span>
                    )}
                </h1>
                {unreadCount > 0 && restaurantId && (
                    <button
                        type="button"
                        onClick={() => markAllRead.mutate({ restaurantId })}
                        className="text-[#13b6ec] text-xs md:text-sm font-medium hover:text-[#10a1d4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] rounded px-2 py-1 shrink-0"
                    >
                        Marcar todas como lidas
                    </button>
                )}
            </div>

            <div
                role="tablist"
                aria-label="Filtrar notificações"
                className="flex gap-2 mb-4 overflow-x-auto"
            >
                {FILTERS.map((f) => {
                    const active = filter === f.id;
                    return (
                        <button
                            key={f.id}
                            role="tab"
                            type="button"
                            aria-selected={active}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] ${
                                active
                                    ? "bg-[#13b6ec]/15 text-[#13b6ec] border-[#13b6ec]/40"
                                    : "bg-[#16262c] text-[#92bbc9] border-[#233f48] hover:text-white"
                            }`}
                        >
                            {f.label}
                        </button>
                    );
                })}
            </div>

            <div
                role="menu"
                aria-label="Lista de notificações"
                className="bg-[#1a2c32] border border-[#233f48] rounded-2xl overflow-hidden divide-y divide-[#233f48]/50"
            >
                {isLoading && notifications.length === 0 ? (
                    <div className="p-4 flex flex-col gap-4" aria-busy="true">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex gap-3">
                                <div className="w-9 h-9 rounded-full bg-[#233f48] animate-pulse shrink-0" />
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="h-3 w-1/2 rounded bg-[#233f48] animate-pulse" />
                                    <div className="h-3 w-full rounded bg-[#233f48] animate-pulse" />
                                </div>
                            </div>
                        ))}
                        <span className="sr-only">Carregando notificações…</span>
                    </div>
                ) : (
                    <NotificationList
                        notifications={notifications}
                        onSelect={handleSelect}
                        emptyLabel={
                            filter === "unread"
                                ? "Nenhuma notificação não lida"
                                : filter === "critical"
                                    ? "Nenhuma notificação prioritária"
                                    : "Nenhuma notificação"
                        }
                    />
                )}
            </div>
        </div>
    );
}
