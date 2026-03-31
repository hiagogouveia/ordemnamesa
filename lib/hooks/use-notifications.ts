import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

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

interface NotificationsResponse {
    notifications: Notification[];
    unread_count: number;
}

export function useNotifications(restaurantId: string | undefined) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["notifications", restaurantId],
        queryFn: async (): Promise<NotificationsResponse> => {
            if (!restaurantId) return { notifications: [], unread_count: 0 };
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/notifications?restaurant_id=${restaurantId}&limit=30`,
                { headers }
            );
            if (!res.ok) return { notifications: [], unread_count: 0 };
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
    });

    // Realtime: escutar novas notificações
    useEffect(() => {
        if (!restaurantId) return;

        const supabase = createClient();

        // Obter user_id para filtrar
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
                    // Apenas invalidar se a notificação é para este usuário
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

        return () => {
            supabase.removeChannel(channel);
        };
    }, [restaurantId, queryClient]);

    return query;
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
