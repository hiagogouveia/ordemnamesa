import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobName } from "./registry";
import { processDomainEventsOutbox } from "@/lib/notifications/process";
import { processAdminNotificationOutbox } from "@/lib/admin-notifications/process";
import { detectDelayedRoutines } from "@/lib/notifications/detect-delayed";
import { applyNotificationRetention } from "@/lib/notifications/retention";

/**
 * HANDLERS — o que cada job efetivamente FAZ.
 *
 * Princípio central desta migração: o worker chama AS MESMAS funções que as rotas
 * `/api/cron/*` chamam hoje. Nenhuma lógica é reescrita — só passa a ser disparada por
 * um processo interno em vez de um `curl` do GitHub. Quando a superfície HTTP for
 * removida (F6), estas funções continuam idênticas; só perdem o invólucro de rota.
 *
 * Cada handler devolve um `JobResult` uniforme. `itemsProcessed` é o que alimenta o
 * histórico legível de `job_runs` — e a regra do "no-op não vira linha": se um job
 * processou 0 itens, o runner não grava execução (só atualiza `last_run_at`).
 */

export interface JobResult {
    itemsProcessed: number;
    /** Detalhe opcional para o log/painel (ex.: quantos de cada tipo). */
    details?: Record<string, number>;
}

export type JobHandler = (admin: SupabaseClient) => Promise<JobResult>;

/**
 * Photo/history-retention ainda têm a lógica DENTRO da rota (`app/api/cron/*`), não num
 * módulo. Serão extraídos para `lib/` na F5, quando forem migrados — aí ganham handler
 * real. Até lá, um handler que sinaliza "não implementado no worker" impede que sejam
 * ligados por engano antes da extração.
 */
function notYetExtracted(name: string): JobHandler {
    return async () => {
        throw new Error(
            `[jobs] "${name}" ainda não foi extraído da rota para lib/ — migra na F5, não ligar antes.`,
        );
    };
}

export const JOB_HANDLERS: Record<JobName, JobHandler> = {
    "domain-events": async (admin) => {
        const r = await processDomainEventsOutbox({ limit: 100, admin });
        return {
            itemsProcessed: r.processed + r.retrying + r.exhausted,
            details: { processed: r.processed, retrying: r.retrying, exhausted: r.exhausted },
        };
    },

    "admin-notifications": async () => {
        const r = await processAdminNotificationOutbox({ limit: 100 });
        return {
            itemsProcessed: r.sent + r.failed,
            details: { sent: r.sent, failed: r.failed },
        };
    },

    "routines-delayed": async (admin) => {
        const r = await detectDelayedRoutines({ admin });
        return {
            itemsProcessed: r.delayed,
            details: { restaurants: r.restaurants, checked: r.checked, delayed: r.delayed },
        };
    },

    "notifications-retention": async (admin) => {
        const r = await applyNotificationRetention({ admin });
        const total = r.notificationsRead + r.notificationsUnread + r.eventsProcessed;
        return {
            itemsProcessed: total,
            details: {
                notifications_read: r.notificationsRead,
                notifications_unread: r.notificationsUnread,
                events_processed: r.eventsProcessed,
            },
        };
    },

    "photo-retention": notYetExtracted("photo-retention"),
    "history-retention": notYetExtracted("history-retention"),
};
