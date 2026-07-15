import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_REGISTRY, type JobName } from "./registry";
import { JOB_HANDLERS, type JobResult } from "./handlers";
import { acquireLease, releaseLease } from "./lease";
import { notificationLog } from "@/lib/notifications/log";

/**
 * RUNNER — executa UM job, uma vez.
 *
 * É chamado tanto pelo processo filho que o supervisor forka (execução agendada)
 * quanto pelo disparo manual (`worker.js run <job>`). Um caminho só.
 *
 * Responsabilidades, em ordem:
 *   1. Adquirir o lease (se outro worker já pegou, desiste — não é erro).
 *   2. Executar o handler com TIMEOUT DURO.
 *   3. Registrar o desfecho em `job_runs` — mas SÓ se for significativo (ver no-op).
 *   4. Liberar o lease e atualizar `job_state` (sucesso zera falhas; falha incrementa).
 *
 * NUNCA lança para o chamador: o supervisor não pode ser derrubado por um job. O
 * desfecho volta no retorno.
 */

export type RunOutcome = "skipped" | "success" | "failed" | "timeout" | "noop";

export interface RunReport {
    job: JobName;
    outcome: RunOutcome;
    itemsProcessed?: number;
    error?: string;
    durationMs: number;
}

/** Modo observador (F4): registra o que FARIA, sem executar o handler. */
export interface RunOptions {
    observe?: boolean;
    workerId: string;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new TimeoutError(ms)), ms);
        p.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
        );
    });
}

class TimeoutError extends Error {
    constructor(ms: number) {
        super(`job excedeu o timeout de ${ms}ms`);
        this.name = "TimeoutError";
    }
}

export async function runJob(
    admin: SupabaseClient,
    job: JobName,
    opts: RunOptions,
): Promise<RunReport> {
    const started = Date.now();
    const def = JOB_REGISTRY[job];
    const now = new Date();

    // 1. Lease. Outro worker já está com este job → desiste em silêncio.
    const got = await acquireLease(admin, job, opts.workerId, now);
    if (!got) {
        return { job, outcome: "skipped", durationMs: Date.now() - started };
    }

    // Modo observador: valida agendamento/lease sem tocar em nada de negócio.
    if (opts.observe) {
        await releaseLease(admin, job, "success", now);
        notificationLog.info({
            op: "materialize",
            action: `job:${job}`,
            status: "observed",
            msg: `[observer] rodaria agora (worker ${opts.workerId})`,
        });
        return { job, outcome: "noop", durationMs: Date.now() - started };
    }

    let runId: string | null = null;
    try {
        // Self-healing: adquirimos o lease, logo somos o ÚNICO dono deste job agora. Qualquer
        // linha `running` anterior deste job é órfã (worker morto num deploy, tipicamente) —
        // marca como `interrupted`. Sem isto, um run interrompido ficaria `running` até um
        // boot posterior ao vencimento do lease, mentindo "travado" no painel. O reclaim de
        // boot cobre o restart; este cobre o intervalo entre boots.
        await admin
            .from("job_runs")
            .update({ status: "interrupted", finished_at: new Date().toISOString() })
            .eq("job_name", job)
            .eq("status", "running")
            .then(() => undefined, () => undefined);

        // 2. Marca `running` no histórico (será atualizado ao fim ou virará no-op).
        const { data: runRow } = await admin
            .from("job_runs")
            .insert({ job_name: job, worker_id: opts.workerId, status: "running" })
            .select("id")
            .single();
        runId = runRow?.id ?? null;

        // 3. Executa com timeout duro.
        const result: JobResult = await withTimeout(JOB_HANDLERS[job](admin), def.timeoutMs);

        await releaseLease(admin, job, "success", new Date());

        // No-op não polui o histórico: se nada foi processado, apaga a linha `running`
        // e o desfecho é `noop`. `job_state.last_run_at` (atualizado no releaseLease)
        // registra que o job rodou; `job_runs` fica só com o que aconteceu de fato.
        if (result.itemsProcessed === 0) {
            if (runId) await admin.from("job_runs").delete().eq("id", runId);
            return { job, outcome: "noop", itemsProcessed: 0, durationMs: Date.now() - started };
        }

        if (runId) {
            await admin
                .from("job_runs")
                .update({
                    status: "success",
                    finished_at: new Date().toISOString(),
                    items_processed: result.itemsProcessed,
                })
                .eq("id", runId);
        }

        notificationLog.info({
            op: "materialize",
            action: `job:${job}`,
            status: "success",
            msg: `${result.itemsProcessed} item(ns)`,
        });

        return {
            job,
            outcome: "success",
            itemsProcessed: result.itemsProcessed,
            durationMs: Date.now() - started,
        };
    } catch (err) {
        const isTimeout = err instanceof TimeoutError;
        const message = err instanceof Error ? err.message : "unknown";

        await releaseLease(admin, job, "failure", new Date()).catch(() => undefined);

        if (runId) {
            await admin
                .from("job_runs")
                .update({
                    status: isTimeout ? "timeout" : "failed",
                    finished_at: new Date().toISOString(),
                    error: message,
                })
                .eq("id", runId)
                .then(() => undefined, () => undefined);
        }

        notificationLog.error({
            op: "materialize",
            action: `job:${job}`,
            status: isTimeout ? "timeout" : "failed",
            msg: message,
        });

        return {
            job,
            outcome: isTimeout ? "timeout" : "failed",
            error: message,
            durationMs: Date.now() - started,
        };
    }
}

/**
 * RECLAIM — no boot do worker, marca como `interrupted` as execuções `running` orfãs
 * (worker morto no meio de um job, tipicamente num deploy). Sem isso, ficariam linhas
 * "eternamente rodando" poluindo o histórico e mentindo para o painel.
 *
 * Só toca linhas cujo lease JÁ EXPIROU — uma execução legitimamente em curso noutro
 * worker tem lease vivo e não é tocada.
 */
export async function reclaimStaleRuns(admin: SupabaseClient): Promise<number> {
    // Jobs cujo lease expirou (ninguém segura mais).
    const { data: freeJobs } = await admin
        .from("job_state")
        .select("job_name")
        .lt("locked_until", new Date().toISOString());

    const freeNames = (freeJobs ?? []).map((r) => r.job_name as string);
    if (freeNames.length === 0) return 0;

    const { data, error } = await admin
        .from("job_runs")
        .update({ status: "interrupted", finished_at: new Date().toISOString() })
        .eq("status", "running")
        .in("job_name", freeNames)
        .select("id");

    if (error) throw new Error(`reclaimStaleRuns: ${error.message}`);
    return data?.length ?? 0;
}
