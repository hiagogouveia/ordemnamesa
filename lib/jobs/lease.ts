import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_REGISTRY, JOB_NAMES, effectiveIntervalMs, type JobName } from "./registry";

/**
 * Sentinela de "lease livre": em vez de deixar `locked_until` ser NULL, gravamos um
 * instante no passado distante. Assim a condição "livre" é sempre `locked_until < now` —
 * um único `.lt()`, sem `.or(... .is.null)`.
 *
 * Isto NÃO é preferência de estilo: o PostgREST tem um bug em que `.or()` referenciando
 * uma coluna dentro de um UPDATE falha com "column does not exist" (o `.lt()` direto
 * funciona). Um sentinela elimina a necessidade do `.or()` e torna o lease robusto.
 */
const FREE_SENTINEL = "1970-01-01T00:00:00Z";

/**
 * LEASE — coordenação distribuída sobre Postgres, sem Redis nem leader election.
 *
 * O problema: quando houver 2+ workers (múltiplas VPS, ou escala horizontal), dois não
 * podem rodar o mesmo job ao mesmo tempo. A solução canônica seria `pg_advisory_lock`,
 * mas ela NÃO funciona neste stack: é session-scoped, e o pooler do Supabase devolve
 * conexões arbitrárias via PostgREST — o lock seria adquirido numa conexão e liberado
 * noutra. Silenciosamente inútil.
 *
 * Em vez disso: um LEASE COM TTL numa linha de `job_state`. Um único `UPDATE ... WHERE`
 * atômico decide o vencedor. O TTL cobre o worker que morreu segurando o lease.
 *
 * E, mesmo assim, o lease NÃO é a garantia final de correção — a IDEMPOTÊNCIA é. Se por
 * um caminho impensado dois workers rodarem o mesmo job, os índices UNIQUE de dedup
 * impedem o dano. O lease evita TRABALHO DESPERDIÇADO; a idempotência evita CORRUPÇÃO.
 */

/** Semeia job_state a partir do registry (idempotente). Chamado no boot do worker. */
export async function ensureJobState(admin: SupabaseClient): Promise<void> {
    // `locked_until` nasce com o sentinela (= livre), nunca NULL — ver FREE_SENTINEL.
    const rows = JOB_NAMES.map((job_name) => ({ job_name, locked_until: FREE_SENTINEL }));
    // onConflict do_nothing: preserva `enabled`, `last_run_at` etc. de jobs já existentes.
    // O banco nunca é fonte da LISTA (isso é o registry); só ganha as linhas que faltam.
    const { error } = await admin
        .from("job_state")
        .upsert(rows, { onConflict: "job_name", ignoreDuplicates: true });
    if (error) throw new Error(`ensureJobState: ${error.message}`);
}

export interface DueJob {
    name: JobName;
    consecutiveFailures: number;
}

/**
 * Quais jobs venceram e estão livres para rodar.
 *
 * "Venceu" = habilitado, sem lease ativo, e `last_run_at` mais velho que o intervalo
 * (com backoff exponencial aplicado sobre `consecutive_failures`). Um job nunca rodado
 * (`last_run_at IS NULL`) está sempre vencido — é o que faz a RECUPERAÇÃO após reboot:
 * ao subir, o worker vê os jobs vencidos e roda imediatamente (o `Persistent=true` do
 * systemd, sem systemd).
 */
export async function findDueJobs(admin: SupabaseClient, now: Date): Promise<DueJob[]> {
    const { data, error } = await admin
        .from("job_state")
        .select("job_name, enabled, last_run_at, locked_until, consecutive_failures");
    if (error) throw new Error(`findDueJobs: ${error.message}`);

    const due: DueJob[] = [];
    for (const row of data ?? []) {
        const name = row.job_name as string;
        if (!(name in JOB_REGISTRY)) continue; // linha órfã (job removido do registry)
        if (!row.enabled) continue; // kill switch

        // Lease ativo de outro worker → pula. (Sentinela no passado = livre.)
        if (row.locked_until && new Date(row.locked_until) > now) continue;

        // Reset defensivo: se uma linha legada tiver locked_until NULL, trata como livre.

        const def = JOB_REGISTRY[name as JobName];
        const interval = effectiveIntervalMs(def.everySeconds, def.maxBackoffSeconds, row.consecutive_failures ?? 0);

        const last = row.last_run_at ? new Date(row.last_run_at).getTime() : 0;
        if (now.getTime() - last >= interval) {
            due.push({ name: name as JobName, consecutiveFailures: row.consecutive_failures ?? 0 });
        }
    }
    return due;
}

/**
 * Tenta ADQUIRIR o lease de um job. Retorna `true` se este worker venceu.
 *
 * É o ponto onde a concorrência é resolvida: o `UPDATE ... WHERE (lease livre)` é
 * atômico no Postgres. Dois workers correndo → um faz 0 linhas, o outro 1. Sem corrida.
 */
export async function acquireLease(
    admin: SupabaseClient,
    name: JobName,
    workerId: string,
    now: Date,
): Promise<boolean> {
    const lockedUntil = new Date(now.getTime() + JOB_REGISTRY[name].lockTtlMs).toISOString();

    // "livre" = locked_until < agora. Como a liberação grava o sentinela (não NULL),
    // este único filtro cobre tanto o job nunca-travado quanto o lease expirado — sem
    // `.or(...is.null)`, que dispara o bug do PostgREST em UPDATE.
    const { data, error } = await admin
        .from("job_state")
        .update({ locked_by: workerId, locked_until: lockedUntil })
        .eq("job_name", name)
        .lt("locked_until", now.toISOString())
        .select("job_name");

    if (error) throw new Error(`acquireLease(${name}): ${error.message}`);
    return (data?.length ?? 0) === 1;
}

/**
 * Libera o lease e grava o desfecho do agendamento no `job_state`.
 * Chamado sempre pelo dono do lease, ao fim da execução (ou no shutdown gracioso).
 */
export async function releaseLease(
    admin: SupabaseClient,
    name: JobName,
    outcome: "success" | "failure",
    ranAt: Date,
): Promise<void> {
    const patch: Record<string, unknown> = {
        locked_by: null,
        locked_until: FREE_SENTINEL, // livre = sentinela no passado, nunca NULL (ver acima)
        last_run_at: ranAt.toISOString(),
    };
    if (outcome === "success") {
        patch.last_success_at = ranAt.toISOString();
        patch.consecutive_failures = 0;
    }

    // Falha incrementa o contador — feito por RPC-less read+write seria uma corrida, mas
    // como só o DONO DO LEASE chama isto, não há concorrência nesta linha neste momento.
    if (outcome === "failure") {
        const { data } = await admin
            .from("job_state")
            .select("consecutive_failures")
            .eq("job_name", name)
            .single();
        patch.consecutive_failures = (data?.consecutive_failures ?? 0) + 1;
    }

    const { error } = await admin.from("job_state").update(patch).eq("job_name", name);
    if (error) throw new Error(`releaseLease(${name}): ${error.message}`);
}
