import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    DEDUP_KEYS,
    type DomainEvent,
    type DomainEventPayloadMap,
    type DomainEventType,
    PAYLOAD_VERSION,
} from "./contract";
import { settleDomainEvent, type StoredDomainEvent } from "./materialize";
import { notificationLog } from "./log";

/**
 * EMISSÃO DE EVENTOS DE DOMÍNIO — o único caminho por onde nasce uma notificação.
 *
 * Antes do s90, cada rota de negócio montava a notificação inline: decidia o
 * destinatário, o texto e o `related_id`, e engolia o erro num `catch`. Se o insert
 * falhasse, a notificação simplesmente sumia — sem trilha, sem retry.
 *
 * Agora a rota de negócio só DECLARA O QUE ACONTECEU. Quem decide quem é notificado,
 * com que prioridade e para onde o clique leva é o materializador — em um só lugar.
 *
 * Fluxo:
 *   1. upsert em `domain_events` com a dedup_key determinística.
 *      ⇒ idempotência de graça: retry de rota, double-submit e cron sobreposto
 *        colidem no índice UNIQUE(event_type, dedup_key) e viram no-op.
 *   2. materializa as notificações inline (fast-path).
 *   3. se a materialização falhar, a linha fica `pending` com `last_error` e o cron
 *      reprocessa (F3). O erro deixa de ser engolido.
 *
 * NUNCA lança: finalizar uma rotina não pode quebrar porque a notificação está fora
 * do ar. Mas, ao contrário de antes, a falha agora fica registrada e é reprocessável.
 */
export async function emitDomainEvent<T extends DomainEventType>(
    admin: SupabaseClient,
    type: T,
    args: {
        restaurantId: string;
        actorUserId: string | null;
        payload: DomainEventPayloadMap[T];
    },
): Promise<void> {
    const dedupKey = (DEDUP_KEYS[type] as (p: DomainEventPayloadMap[T]) => string)(args.payload);

    try {
        const { data, error } = await admin
            .from("domain_events")
            .upsert(
                {
                    restaurant_id: args.restaurantId,
                    event_type: type,
                    dedup_key: dedupKey,
                    payload: args.payload,
                    payload_version: PAYLOAD_VERSION,
                    actor_user_id: args.actorUserId,
                },
                { onConflict: "event_type,dedup_key", ignoreDuplicates: true },
            )
            .select()
            .maybeSingle();

        if (error) {
            // Não derruba o fluxo de negócio. Mas isto é um erro alto: sem o evento,
            // não há notificação nem trilha.
            notificationLog.error({
                op: "emit",
                action: type,
                restaurant_id: args.restaurantId,
                status: "event_insert_failed",
                msg: error.message,
            });
            return;
        }

        // `ignoreDuplicates` devolve 0 linhas quando a chave já existia: o fato já
        // foi registrado antes. Isto é o caminho feliz do dedup, não um erro.
        if (!data) {
            notificationLog.info({
                op: "emit",
                action: type,
                restaurant_id: args.restaurantId,
                status: "deduped",
                msg: dedupKey,
            });
            return;
        }

        const event = data as StoredDomainEvent;

        notificationLog.info({
            op: "emit",
            action: type,
            restaurant_id: args.restaurantId,
            status: "emitted",
            msg: event.id,
        });

        // Fast-path inline: materializa AGORA (latência ~zero para a notificação). Se
        // falhar, `settleDomainEvent` deixa o evento pending com backoff, e o worker o
        // reentrega — MESMO invólucro que o retry usa, uma implementação só (F3).
        await settleDomainEvent(admin, event);
    } catch (err) {
        notificationLog.error({
            op: "emit",
            action: type,
            restaurant_id: args.restaurantId,
            status: "exception",
            msg: err instanceof Error ? err.message : "unknown",
        });
    }
}

// `processDomainEvent` foi REMOVIDO nesta fase (F3): seu invólucro (materialize + settle
// + log) era uma duplicata do que o cron de retry fazia. Ambos agora usam
// `settleDomainEvent` (lib/notifications/materialize.ts) — uma implementação, dois
// gatilhos. Consumidores externos devem importar `settleDomainEvent`.
