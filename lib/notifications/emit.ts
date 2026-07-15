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

        // `ignoreDuplicates`/ON CONFLICT devolve 0 linhas quando a chave já existia: o
        // fato já foi registrado. Caminho feliz do dedup, não erro.
        await settleEmittedEvent(admin, (data as StoredDomainEvent | null) ?? null, {
            type,
            restaurantId: args.restaurantId,
            dedupKey,
        });
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

/**
 * Materializa (fast-path inline) um domain_event JÁ inserido, ou registra o dedup se ele
 * não foi criado (linha nula). Extraído para servir DOIS chamadores com uma lógica só:
 *   - emitDomainEvent (upsert + materialize no mesmo processo);
 *   - o caminho TRANSACIONAL (report_task_issue_tx insere o evento atomicamente com a
 *     ocorrência; a rota chama isto DEPOIS, com a linha que o RPC devolveu).
 *
 * Se `event` é null → o fato já existia (deduped): nada a materializar. Se falhar,
 * settleDomainEvent deixa o evento pending com backoff e o worker reentrega — mesma rede
 * de segurança do emit inline.
 */
export async function settleEmittedEvent(
    admin: SupabaseClient,
    event: StoredDomainEvent | null,
    ctx: { type: DomainEventType; restaurantId: string; dedupKey: string },
): Promise<void> {
    if (!event) {
        notificationLog.info({
            op: "emit",
            action: ctx.type,
            restaurant_id: ctx.restaurantId,
            status: "deduped",
            msg: ctx.dedupKey,
        });
        return;
    }

    notificationLog.info({
        op: "emit",
        action: ctx.type,
        restaurant_id: ctx.restaurantId,
        status: "emitted",
        msg: event.id,
    });

    await settleDomainEvent(admin, event);
}

// `processDomainEvent` foi REMOVIDO nesta fase (F3): seu invólucro (materialize + settle
// + log) era uma duplicata do que o cron de retry fazia. Ambos agora usam
// `settleDomainEvent` (lib/notifications/materialize.ts) — uma implementação, dois
// gatilhos. Consumidores externos devem importar `settleDomainEvent`.
