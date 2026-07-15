import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notificationLog } from "./log";
import { settleDomainEvent, type StoredDomainEvent } from "./materialize";

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
 * receba duas cópias. E a lógica de materialização/backoff é COMPARTILHADA com o
 * fast-path via `settleDomainEvent` (F3) — este módulo só ORQUESTRA (busca elegíveis,
 * contabiliza).
 */

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

    const rows = (data ?? []) as StoredDomainEvent[];

    const result: ProcessResult = { picked: rows.length, processed: 0, retrying: 0, exhausted: 0 };

    for (const row of rows) {
        // MESMO invólucro do fast-path inline (F3): materializa + resolve status + log,
        // com backoff. Antes este loop reimplementava tudo isso; agora só contabiliza.
        const { outcome } = await settleDomainEvent(admin, row);
        if (outcome === "processed") result.processed += 1;
        else if (outcome === "exhausted") result.exhausted += 1;
        else result.retrying += 1;
    }

    return result;
}
