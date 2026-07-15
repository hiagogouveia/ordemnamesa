import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_RETENTION_DAYS, HISTORY_RETENTION_DAYS } from "@/lib/config/photo-retention";
import { notificationLog } from "@/lib/notifications/log";

/**
 * RETENÇÃO de FOTOS e HISTÓRICO — a lógica que antes vivia dentro de
 * `app/api/cron/{photo,history}-retention/route.ts`.
 *
 * Extraída para cá (s91, F5) para que o worker e a rota chamem A MESMA função — uma fonte
 * de verdade só. Quando a superfície HTTP sair (F6), a rota some e isto fica intacto.
 *
 * O trabalho pesado é dos RPCs SQL (`expired_evidence_photo_paths`, `purge_evidence_photo_refs`,
 * `purge_expired_history`); aqui orquestramos e removemos os bytes do Storage em lotes.
 */

const STORAGE_BUCKET = "photos";
const REMOVE_CHUNK = 100; // storage.remove em lotes para não estourar payload

function getAdminSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

/** Remove uma lista de paths do Storage em lotes. Devolve quantos saíram e os erros. */
async function removeFromStorage(
    admin: SupabaseClient,
    paths: string[],
): Promise<{ removed: number; removeErrors: string[] }> {
    let removed = 0;
    const removeErrors: string[] = [];
    for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
        const chunk = paths.slice(i, i + REMOVE_CHUNK);
        const { error } = await admin.storage.from(STORAGE_BUCKET).remove(chunk);
        if (error) {
            removeErrors.push(error.message);
        } else {
            removed += chunk.length;
        }
    }
    return { removed, removeErrors };
}

// ── PHOTO RETENTION ──────────────────────────────────────────────────────────

export interface PhotoRetentionResult {
    dryRun: boolean;
    retentionDays: number;
    /** Quantos paths estavam expirados (o "seria apagado" no dry-run). */
    expiredCount: number;
    /** Quantos arquivos foram efetivamente removidos do Storage (0 no dry-run). */
    removed: number;
    /** Amostra de paths, só no dry-run (para inspeção). */
    sample?: string[];
    refs?: unknown;
    removeErrors?: string[];
}

/**
 * Remove fotos de evidência com mais de PHOTO_RETENTION_DAYS dias. Apaga só os BYTES
 * (arquivo + referências), preservando o registro de execução.
 *
 * Ordem anti-órfão: zera refs no banco PRIMEIRO, depois remove os arquivos. Falha parcial
 * gera no máximo órfão (limpo na próxima rodada), nunca referência quebrada.
 */
export async function applyPhotoRetention(
    options: { admin?: SupabaseClient; dryRun?: boolean } = {},
): Promise<PhotoRetentionResult> {
    const admin = options.admin ?? getAdminSupabase();
    const dryRun = options.dryRun ?? false;

    // 1) Paths expirados (por idade do arquivo).
    const { data: expired, error: listErr } = await admin.rpc("expired_evidence_photo_paths", {
        retention_days: PHOTO_RETENTION_DAYS,
    });
    if (listErr) throw new Error(`photo-retention (listar): ${listErr.message}`);

    const paths: string[] = Array.isArray(expired)
        ? (expired as Array<string | { name?: string }>)
              .map((p) => (typeof p === "string" ? p : p?.name ?? ""))
              .filter(Boolean)
        : [];

    if (dryRun) {
        return {
            dryRun: true,
            retentionDays: PHOTO_RETENTION_DAYS,
            expiredCount: paths.length,
            removed: 0,
            sample: paths.slice(0, 10),
        };
    }

    if (paths.length === 0) {
        return { dryRun: false, retentionDays: PHOTO_RETENTION_DAYS, expiredCount: 0, removed: 0, refs: null };
    }

    // 2) Zerar referências no banco (antes de apagar os arquivos).
    const { data: refsResult, error: purgeErr } = await admin.rpc("purge_evidence_photo_refs", {
        p_paths: paths,
    });
    if (purgeErr) throw new Error(`photo-retention (zerar refs): ${purgeErr.message}`);

    // 3) Remover arquivos do Storage em lotes.
    const { removed, removeErrors } = await removeFromStorage(admin, paths);

    notificationLog.info({
        op: "materialize",
        action: "photo-retention",
        status: "done",
        msg: `${removed}/${paths.length} fotos removidas${removeErrors.length ? ` (${removeErrors.length} erro(s))` : ""}`,
    });

    return {
        dryRun: false,
        retentionDays: PHOTO_RETENTION_DAYS,
        expiredCount: paths.length,
        removed,
        refs: refsResult,
        removeErrors: removeErrors.length ? removeErrors : undefined,
    };
}

// ── HISTORY RETENTION (deleção IRREVERSÍVEL) ─────────────────────────────────

export interface HistoryRetentionResult {
    dryRun: boolean;
    retentionDays: number;
    issuesDeleted: number;
    executionsDeleted: number;
    assumptionsDeleted: number;
    photosRemoved: number;
    removeErrors?: string[];
    /** Payload cru do RPC no dry-run (contagens do que seria apagado). */
    preview?: Record<string, unknown>;
}

/**
 * Remove o HISTÓRICO de execução com mais de HISTORY_RETENTION_DAYS dias — task_executions,
 * checklist_assumptions, task_issues (+ task_issue_events por cascade), de TODOS os tipos.
 *
 * NUNCA remove definições de rotina (checklists/checklist_tasks) nem recebimentos
 * (receiving_expectations) — só o histórico além do período. Nada com < N dias é tocado.
 *
 * DELEÇÃO IRREVERSÍVEL. O RPC `purge_expired_history` faz a deleção na ordem segura e
 * devolve os paths das fotos das linhas apagadas, removidas aqui do Storage.
 */
export async function applyHistoryRetention(
    options: { admin?: SupabaseClient; dryRun?: boolean } = {},
): Promise<HistoryRetentionResult> {
    const admin = options.admin ?? getAdminSupabase();
    const dryRun = options.dryRun ?? false;

    const { data, error } = await admin.rpc("purge_expired_history", {
        retention_days: HISTORY_RETENTION_DAYS,
        dry_run: dryRun,
    });
    if (error) throw new Error(`history-retention (${dryRun ? "dry-run" : "purge"}): ${error.message}`);

    const d = (data ?? {}) as Record<string, unknown>;

    if (dryRun) {
        return {
            dryRun: true,
            retentionDays: HISTORY_RETENTION_DAYS,
            issuesDeleted: Number(d.issues_deleted ?? 0),
            executionsDeleted: Number(d.executions_deleted ?? 0),
            assumptionsDeleted: Number(d.assumptions_deleted ?? 0),
            photosRemoved: 0,
            preview: d,
        };
    }

    // Remove do Storage as fotos das linhas apagadas (em lotes).
    const paths: string[] = Array.isArray(d.photo_paths)
        ? (d.photo_paths as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0)
        : [];
    const { removed, removeErrors } = await removeFromStorage(admin, paths);

    const result: HistoryRetentionResult = {
        dryRun: false,
        retentionDays: HISTORY_RETENTION_DAYS,
        issuesDeleted: Number(d.issues_deleted ?? 0),
        executionsDeleted: Number(d.executions_deleted ?? 0),
        assumptionsDeleted: Number(d.assumptions_deleted ?? 0),
        photosRemoved: removed,
        removeErrors: removeErrors.length ? removeErrors : undefined,
    };

    notificationLog.info({
        op: "materialize",
        action: "history-retention",
        status: "done",
        msg: `${result.executionsDeleted} exec, ${result.assumptionsDeleted} assumptions, ${result.issuesDeleted} issues, ${removed} fotos (IRREVERSÍVEL)`,
    });

    return result;
}
