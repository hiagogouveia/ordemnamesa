import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notificationLog } from "./log";

/**
 * RETENÇÃO da Central de Notificações.
 *
 * Política:
 *   - Lidas: apagar após 90 dias.
 *   - Não lidas: apagar após 180 dias. Uma notificação não lida há 6 meses não é
 *     acionável — é ruído que infla o badge e esconde o que importa.
 *   - `domain_events` processados: apagar após 90 dias.
 *   - `domain_events` FALHADOS: **reter**. São evidência de bug, não lixo. Apagá-los
 *     seria destruir exatamente a informação que o outbox existe para preservar.
 *
 * SEM tabela de arquivo. A trilha analítica vive em `event_logs` (que tem retenção
 * própria), então apagar a linha da notificação não perde nada auditável. Criar um
 * `notifications_archive` seria duplicar a verdade por um ganho que não consigo nomear.
 *
 * Efeito colateral bem-vindo: o renderer de notificações legadas (sem payload tipado) é
 * TEMPORÁRIO POR CONSTRUÇÃO — em 90 dias essas linhas envelhecem e somem sozinhas.
 */

export const RETENTION = {
    readDays: 90,
    unreadDays: 180,
    processedEventDays: 90,
} as const;

export interface RetentionResult {
    notificationsRead: number;
    notificationsUnread: number;
    eventsProcessed: number;
}

function getAdminSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

function cutoff(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function applyNotificationRetention(
    options: { admin?: SupabaseClient } = {},
): Promise<RetentionResult> {
    const admin = options.admin ?? getAdminSupabase();

    const readRes = await admin
        .from("notifications")
        .delete({ count: "exact" })
        .eq("read", true)
        .lt("created_at", cutoff(RETENTION.readDays));
    if (readRes.error) throw new Error(`retenção (lidas): ${readRes.error.message}`);

    const unreadRes = await admin
        .from("notifications")
        .delete({ count: "exact" })
        .eq("read", false)
        .lt("created_at", cutoff(RETENTION.unreadDays));
    if (unreadRes.error) throw new Error(`retenção (não lidas): ${unreadRes.error.message}`);

    // Só os PROCESSADOS. Os `failed` ficam — são a evidência do bug.
    const eventsRes = await admin
        .from("domain_events")
        .delete({ count: "exact" })
        .eq("status", "processed")
        .lt("created_at", cutoff(RETENTION.processedEventDays));
    if (eventsRes.error) throw new Error(`retenção (eventos): ${eventsRes.error.message}`);

    const result: RetentionResult = {
        notificationsRead: readRes.count ?? 0,
        notificationsUnread: unreadRes.count ?? 0,
        eventsProcessed: eventsRes.count ?? 0,
    };

    notificationLog.info({
        op: "materialize",
        action: "retention",
        status: "done",
        msg: `${result.notificationsRead} lidas, ${result.notificationsUnread} não lidas, ${result.eventsProcessed} eventos`,
    });

    return result;
}
