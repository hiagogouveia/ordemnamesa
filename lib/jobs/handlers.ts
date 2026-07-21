import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobName } from "./registry";
import { processDomainEventsOutbox } from "@/lib/notifications/process";
import { processAdminNotificationOutbox } from "@/lib/admin-notifications/process";
import { detectDelayedRoutines } from "@/lib/notifications/detect-delayed";
import { reconcileTemporaryTransfers } from "@/lib/api/temporary-transfer";
import { applyNotificationRetention } from "@/lib/notifications/retention";
import { applyPhotoRetention, applyHistoryRetention } from "@/lib/photos/retention";

/**
 * HANDLERS — o que cada job efetivamente FAZ.
 *
 * Princípio central desta migração: o worker chama as mesmas funções que as antigas
 * rotas `/api/cron/*` chamavam. A superfície HTTP foi removida na F6; o worker é o
 * único disparador (além do `worker.cjs run <job>` manual).
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

    // s94 — reconciliador (converge estado, não reage a evento): rodar 2× tem o mesmo
    // efeito de rodar 1×, e worker fora do ar por dias converge na volta.
    "temporary-transfers": async (admin) => {
        const r = await reconcileTemporaryTransfers({ admin });
        return {
            itemsProcessed: r.activated + r.expired + r.targetInactive,
            details: {
                activated: r.activated,
                expired: r.expired,
                target_inactive: r.targetInactive,
                restaurants: r.restaurants,
            },
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

    "photo-retention": async (admin) => {
        const r = await applyPhotoRetention({ admin });
        return {
            itemsProcessed: r.removed,
            details: { expired: r.expiredCount, removed: r.removed },
        };
    },

    // Deleção IRREVERSÍVEL. Roda real (dryRun=false) quando o job executa — o guard de
    // segurança contra disparo manual acidental fica no worker.ts (--confirm).
    "history-retention": async (admin) => {
        const r = await applyHistoryRetention({ admin });
        const total = r.executionsDeleted + r.assumptionsDeleted + r.issuesDeleted;
        return {
            itemsProcessed: total,
            details: {
                executions: r.executionsDeleted,
                assumptions: r.assumptionsDeleted,
                issues: r.issuesDeleted,
                photos: r.photosRemoved,
            },
        };
    },
};
