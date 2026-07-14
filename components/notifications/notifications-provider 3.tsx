"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import {
    useMarkNotificationRead,
    useNotificationsRealtime,
} from "@/lib/hooks/use-notifications";
import {
    NotificationNavigatorProvider,
    type NavigationTelemetry,
} from "@/lib/notifications/navigator";

/**
 * Monta a infraestrutura de notificações uma única vez, na raiz do app:
 *
 *  - a subscription de realtime (que ANTES vivia dentro do `PasswordChangedBanner` —
 *    um acoplamento frágil: se aquele banner fosse removido ou refatorado, o realtime
 *    de TODAS as notificações morreria junto, sem ninguém perceber);
 *  - o NotificationNavigator, que centraliza a navegação e o handshake de leitura.
 *
 * O realtime segue sendo assinado UMA vez só — múltiplas instâncias com o mesmo
 * restaurantId quebram o Supabase ("cannot add postgres_changes callbacks after
 * subscribe()").
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const markRead = useMarkNotificationRead();

    useNotificationsRealtime(restaurantId ?? undefined);

    /** Só é chamado pelo `ack` do navigator — nunca no clique. */
    const handleMarkRead = useCallback(
        (notificationId: string) => {
            if (!restaurantId) return;
            markRead.mutate({ notificationId, restaurantId });
        },
        [markRead, restaurantId],
    );

    /** Best-effort e sem await: telemetria jamais pode atrasar ou quebrar a navegação. */
    const handleTelemetry = useCallback(
        (event: NavigationTelemetry) => {
            void (async () => {
                try {
                    const supabase = createClient();
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.access_token) return;

                    await fetch("/api/notifications/telemetry", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({
                            name: event.name,
                            notification_id: event.notificationId,
                            event_id: event.eventId,
                            type: event.type,
                            reason: event.reason,
                            restaurant_id: restaurantId,
                        }),
                        keepalive: true, // sobrevive à navegação que acabou de disparar
                    });
                } catch {
                    // Telemetria é observabilidade, não funcionalidade.
                }
            })();
        },
        [restaurantId],
    );

    return (
        <NotificationNavigatorProvider
            onMarkRead={handleMarkRead}
            onTelemetry={handleTelemetry}
        >
            {children}
        </NotificationNavigatorProvider>
    );
}
