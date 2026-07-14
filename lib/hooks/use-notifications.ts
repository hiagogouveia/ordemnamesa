import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AnyNotification } from "@/lib/notifications/contract";
import { adaptNotificationRow, type NotificationRow } from "@/lib/notifications/parse";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    return headers;
}

export interface NotificationsResponse {
    notifications: AnyNotification[];
    unread_count: number;
}

export const NOTIFICATIONS_PAGE_SIZE = 30;

export function useNotifications(restaurantId: string | undefined) {
    return useQuery({
        queryKey: ["notifications", restaurantId],
        queryFn: async (): Promise<NotificationsResponse> => {
            if (!restaurantId) return { notifications: [], unread_count: 0 };
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/notifications?restaurant_id=${restaurantId}&limit=${NOTIFICATIONS_PAGE_SIZE}`,
                { headers }
            );
            if (!res.ok) return { notifications: [], unread_count: 0 };
            const json = await res.json();

            // s90: a linha crua do banco vira notificação TIPADA aqui. `adaptNotificationRow`
            // nunca lança — payload malformado/tipo desconhecido degrada para uma
            // notificação "unknown", legível e não-clicável. É a rede do "nunca tela branca".
            return {
                notifications: (json.notifications as NotificationRow[]).map(adaptNotificationRow),
                unread_count: json.unread_count ?? 0,
            };
        },
        enabled: !!restaurantId,
        staleTime: 2 * 60 * 1000,     // realtime subscription cuida de atualizações instantâneas
    });
}

// Hook separado para realtime — deve ser chamado UMA ÚNICA VEZ no layout raiz.
// Múltiplas instâncias com o mesmo restaurantId causam erro no Supabase:
// "cannot add postgres_changes callbacks after subscribe()"
export function useNotificationsRealtime(restaurantId: string | undefined) {
    const queryClient = useQueryClient();
    const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

    useEffect(() => {
        if (!restaurantId) return;

        const supabase = createClient();

        let userId: string | undefined;
        supabase.auth.getUser().then(({ data }) => {
            userId = data.user?.id;
        });

        const channel = supabase
            .channel(`notifications-rt-${restaurantId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `restaurant_id=eq.${restaurantId}`,
                },
                (payload) => {
                    if (!userId || payload.new.user_id === userId) {
                        queryClient.invalidateQueries({ queryKey: ["notifications", restaurantId] });
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `restaurant_id=eq.${restaurantId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["notifications", restaurantId] });
                }
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
    }, [restaurantId, queryClient]);
}

export function useMarkNotificationRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ notificationId, restaurantId }: { notificationId: string; restaurantId: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/notifications/read', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ notification_id: notificationId }),
            });
            if (!res.ok) throw new Error('Erro ao marcar notificação');
            return res.json();
        },
        onSuccess: (_, { restaurantId }) => {
            queryClient.invalidateQueries({ queryKey: ["notifications", restaurantId] });
        },
    });
}

export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ restaurantId }: { restaurantId: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/notifications/read', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ mark_all: true, restaurant_id: restaurantId }),
            });
            if (!res.ok) throw new Error('Erro ao marcar notificações');
            return res.json();
        },
        onSuccess: (_, { restaurantId }) => {
            queryClient.invalidateQueries({ queryKey: ["notifications", restaurantId] });
        },
    });
}
