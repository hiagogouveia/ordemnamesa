import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DomainEvent } from "./contract";
import { materializeNotifications } from "./materialize";
import { notificationLog } from "./log";

/**
 * REDE DE SEGURANÇA do outbox de eventos de domínio.
 *
 * O `emitDomainEvent` materializa inline (fast-path). Quando essa materialização
 * falha — banco instável, deploy no meio, bug como o do índice parcial que pegamos
 * na F2 — o evento fica `pending` com `last_error`, e é este processador que o
 * reentrega.
 *
 * É a diferença entre o sistema antigo e este: antes, um `catch` engolia o erro e a
 * notificação sumia sem deixar rastro. Agora ela é reprocessável, e a falha é visível.
 *
 * Reprocessar é seguro: o índice UNIQUE(event_id, user_id) impede que um destinatário
 * receba duas cópias.
 */

/** Backoff exponencial: 1min, 2, 4, 8, 16… — não martela um banco já em apuros. */
function nextAttemptAt(attempts: number): string {
    const minutes = Math.min(2 ** attempts, 60);
    return new Date(Date.now() + minutes * 60_000).toISOString();
}

function getAdminSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

export interface ProcessResult {
    picked: number;
    processed: number;
    retrying: number;
    exhausted: number;
}

export async function processDomainEventsOutbox(
    options: { limit?: number; admin?: SupabaseClient } = {},
): Promise<ProcessResult> {
    const limit = options.limit ?? 100;
    const admin = options.admin ?? getAdminSupabase();

    // Só `pending` é elegível. `failed` é TERMINAL (esgotou as tentativas) — se
    // fosse repescado aqui, um evento com bug permanente seria retentado para
    // sempre, a cada 5 minutos, indefinidamente.
    const { data, error } = await admin
        .from("domain_events")
        .select("*")
        .eq("status", "pending")
        .lte("next_attempt_at", new Date().toISOString())
        .order("occurred_at", { ascending: true })
        .limit(limit);

    if (error) {
        notificationLog.error({ op: "materialize", status: "outbox_query_failed", msg: error.message });
        throw new Error(`outbox query: ${error.message}`);
    }

    const rows = (data ?? []) as (DomainEvent & {
        status: string;
        attempts: number;
        max_attempts: number;
    })[];

    const result: ProcessResult = { picked: rows.length, processed: 0, retrying: 0, exhausted: 0 };

    for (const row of rows) {
        const attempts = row.attempts + 1;

        try {
            const count = await materializeNotifications(admin, row);

            await admin
                .from("domain_events")
                .update({
                    status: "processed",
                    attempts,
                    processed_at: new Date().toISOString(),
                    last_error: null,
                })
                .eq("id", row.id);

            result.processed += 1;
            notificationLog.info({
                op: "materialize",
                action: row.event_type,
                restaurant_id: row.restaurant_id,
                status: "reprocessed",
                msg: `${row.id} → ${count} notificação(ões) (tentativa ${attempts})`,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "unknown";

            // Esgotou as tentativas: para de tentar, mas a linha PERMANECE como
            // evidência do bug. A retenção (F9) não apaga eventos `failed`.
            const exhausted = attempts >= row.max_attempts;

            await admin
                .from("domain_events")
                .update({
                    status: exhausted ? "failed" : "pending",
                    attempts,
                    next_attempt_at: nextAttemptAt(attempts),
                    last_error: message,
                })
                .eq("id", row.id);

            if (exhausted) result.exhausted += 1;
            else result.retrying += 1;

            notificationLog.error({
                op: "materialize",
                action: row.event_type,
                restaurant_id: row.restaurant_id,
                status: exhausted ? "exhausted" : "retry_scheduled",
                msg: `${row.id} (tentativa ${attempts}/${row.max_attempts}): ${message}`,
            });
        }
    }

    return result;
}
