import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AnyNotification } from "@/lib/notifications/contract";
import { adaptNotificationRow, type NotificationRow } from "@/lib/notifications/parse";
import {
    applyRealtimeInsert,
    applyRealtimeUpdate,
    sortNotifications,
} from "@/lib/notifications/group";
import { useAuthUser } from "@/lib/hooks/use-auth-user";

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
            // `sortNotifications` aplica a MESMA ordem canônica dos reducers de realtime
            // (não-lidas → prioridade → recência). Sem isso, uma linha inserida pelo
            // socket poderia "saltar" de posição no próximo refetch.
            return {
                notifications: sortNotifications(
                    (json.notifications as NotificationRow[]).map(adaptNotificationRow),
                ),
                unread_count: json.unread_count ?? 0,
            };
        },
        enabled: !!restaurantId,
        staleTime: 2 * 60 * 1000,     // realtime subscription cuida de atualizações instantâneas
    });
}

/**
 * REALTIME — s90: insere no cache, nunca refaz a lista.
 *
 * ANTES: todo evento disparava `invalidateQueries` → refetch da lista inteira → a lista
 * era REMONTADA e o scroll do dropdown PULAVA. Além disso, o `userId` era resolvido num
 * `.then()` assíncrono sem await: se um INSERT chegasse antes da promise resolver, o
 * guard `if (!userId || ...)` deixava passar de qualquer jeito.
 *
 * AGORA:
 *  - Assina SÓ depois de ter o `userId` (via useAuthUser) e filtra por `user_id` NO
 *    SERVIDOR. Mata a race e para de trazer pelo socket linhas de outros usuários.
 *  - `setQueryData` com MERGE POR ID, nunca substituição. Sem refetch ⇒ a lista não é
 *    remontada ⇒ o scroll é preservado e o item novo entra suavemente no topo.
 *
 * Deve ser chamado UMA ÚNICA VEZ (NotificationsProvider). Múltiplas instâncias com o
 * mesmo restaurantId quebram o Supabase: "cannot add postgres_changes callbacks after
 * subscribe()".
 */
export function useNotificationsRealtime(restaurantId: string | undefined) {
    const queryClient = useQueryClient();
    const { data: user } = useAuthUser();
    const userId = user?.id;

    useEffect(() => {
        // O gate por userId é o que elimina a race: sem ele, não assinamos.
        if (!restaurantId || !userId) return;

        const supabase = createClient();

        const upsertInCache = (
            row: NotificationRow,
            apply: (items: AnyNotification[], incoming: AnyNotification) => AnyNotification[],
        ) => {
            // `adaptNotificationRow` é a MESMA função usada no fetch — por construção, a
            // linha do socket e a da API têm shape idêntico, e o merge não pode divergir.
            const incoming = adaptNotificationRow(row);

            queryClient.setQueryData<NotificationsResponse>(
                ["notifications", restaurantId],
                (old) => {
                    // Sem cache ainda: deixa o fetch normal popular (nada a mesclar).
                    if (!old) return old;

                    const before = old.notifications.find((n) => n.id === incoming.id);
                    const notifications = apply(old.notifications, incoming);

                    // O `unread_count` do servidor é o TOTAL (pode exceder a página), então
                    // ele é ajustado por DELTA — recalculá-lo a partir da página truncaria
                    // o badge (50 não-lidas virariam 30 numa página de 30).
                    const wasUnread = before ? !before.read : false;
                    const isUnread = !incoming.read;
                    let delta = 0;
                    if (!before) delta = isUnread ? 1 : 0;          // linha nova
                    else if (wasUnread && !isUnread) delta = -1;     // foi lida
                    else if (!wasUnread && isUnread) delta = 1;      // voltou a não-lida

                    return {
                        notifications,
                        unread_count: Math.max(0, old.unread_count + delta),
                    };
                },
            );
        };

        const channel = supabase
            .channel(`notifications-rt-${restaurantId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    // Filtro no SERVIDOR: antes era `restaurant_id` e o filtro por usuário
                    // acontecia no cliente (trazendo pelo socket linhas alheias).
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const row = payload.new as NotificationRow;
                    if (row.restaurant_id !== restaurantId) return;
                    upsertInCache(row, (items, incoming) =>
                        applyRealtimeInsert(items, incoming, NOTIFICATIONS_PAGE_SIZE),
                    );
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const row = payload.new as NotificationRow;
                    if (row.restaurant_id !== restaurantId) return;
                    // Patch da linha (read/read_at). Reflete leitura feita em OUTRA ABA
                    // ou em outro dispositivo, sem refetch.
                    upsertInCache(row, applyRealtimeUpdate);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [restaurantId, userId, queryClient]);
}

/**
 * Aplica o patch de leitura no cache — usado pelos updates otimistas.
 *
 * `markAll` é o único caso em que zeramos o contador: só ali sabemos que TODAS as
 * não-lidas (inclusive as fora da página) foram marcadas. Nos demais, ajustamos por
 * delta, porque `unread_count` é o total do servidor e pode exceder a página.
 */
function patchReadInCache(
    queryClient: ReturnType<typeof useQueryClient>,
    restaurantId: string,
    predicate: (n: AnyNotification) => boolean,
    markAll = false,
) {
    queryClient.setQueryData<NotificationsResponse>(
        ["notifications", restaurantId],
        (old) => {
            if (!old) return old;
            const readAt = new Date().toISOString();

            let marked = 0;
            const notifications = old.notifications.map((n) => {
                if (!predicate(n) || n.read) return n;
                marked += 1;
                return { ...n, read: true, read_at: readAt };
            });

            return {
                notifications,
                unread_count: markAll ? 0 : Math.max(0, old.unread_count - marked),
            };
        },
    );
}

export function useMarkNotificationRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ notificationId }: { notificationId: string; restaurantId: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/notifications/read', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ notification_id: notificationId }),
            });
            if (!res.ok) throw new Error('Erro ao marcar notificação');
            return res.json();
        },

        // s90 — update otimista. Antes só invalidava no onSuccess: a notificação só
        // "apagava" depois do round-trip, e o refetch remontava a lista (pulo do scroll).
        onMutate: async ({ notificationId, restaurantId }) => {
            await queryClient.cancelQueries({ queryKey: ["notifications", restaurantId] });
            const previous = queryClient.getQueryData<NotificationsResponse>([
                "notifications",
                restaurantId,
            ]);
            patchReadInCache(queryClient, restaurantId, (n) => n.id === notificationId);
            return { previous };
        },

        onError: (_err, { restaurantId }, context) => {
            if (context?.previous) {
                queryClient.setQueryData(["notifications", restaurantId], context.previous);
            }
        },

        // Sem invalidate: o realtime (UPDATE) já reconcilia com o servidor, e um refetch
        // aqui remontaria a lista — exatamente o "pulo" que estamos eliminando.
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

        onMutate: async ({ restaurantId }) => {
            await queryClient.cancelQueries({ queryKey: ["notifications", restaurantId] });
            const previous = queryClient.getQueryData<NotificationsResponse>([
                "notifications",
                restaurantId,
            ]);
            patchReadInCache(queryClient, restaurantId, () => true, true);
            return { previous };
        },

        onError: (_err, { restaurantId }, context) => {
            if (context?.previous) {
                queryClient.setQueryData(["notifications", restaurantId], context.previous);
            }
        },
    });
}
