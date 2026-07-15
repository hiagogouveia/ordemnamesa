import "server-only";

import { fork } from "child_process";
import { writeFileSync } from "fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureJobState, findDueJobs } from "./lease";
import { reclaimStaleRuns } from "./runner";
import { isJobName } from "./registry";
import { notificationLog } from "@/lib/notifications/log";

/**
 * SUPERVISOR — o único processo residente.
 *
 * Deliberadamente TRIVIAL: ele NÃO executa lógica de negócio. A cada tick pergunta ao
 * banco quais jobs venceram e FORKA UM PROCESSO FILHO para cada. Isso dá a resiliência
 * do modelo efêmero (memória isolada, crash isolado, timeout que mata de verdade) dentro
 * do container — sem systemd, sem acoplar ao host.
 *
 * O modo de falha que mais preocupa num processo residente é o TRAVAMENTO (fica vivo sem
 * fazer nada; o healthcheck do Compose marca unhealthy mas NÃO reinicia). Contra isso: o
 * self-watchdog abaixo. Se um tick não fechar em 3× o intervalo, o supervisor se mata
 * (`process.exit(1)`), e o `restart: always` do compose o reinicia.
 */

const TICK_MS = 10_000;
const WATCHDOG_FACTOR = 3;
/** Heartbeat lido pelo healthcheck do container. Mtime = último tick vivo. */
const HEARTBEAT_FILE = "/tmp/worker-alive";

function touchHeartbeat() {
    try {
        writeFileSync(HEARTBEAT_FILE, String(Date.now()));
    } catch {
        // Não fatal: em dev (fora do container) o path pode não ser gravável.
    }
}

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

/** Id estável por processo: host + pid. Aparece em job_runs.worker_id e nos leases. */
function workerId(): string {
    return `${process.env.HOSTNAME ?? "worker"}-${process.pid}`;
}

interface SupervisorOptions {
    /** Caminho do próprio bundle, para forkar `run <job>`. */
    selfPath: string;
    /** F4: filhos rodam em modo observador (registram o que fariam). */
    observe?: boolean;
    /**
     * F5 — allowlist de jobs que EXECUTAM DE VERDADE mesmo com `observe` global ligado.
     * Vira a chave um job por vez: os fora da lista seguem só observando. Vazio + observe
     * = tudo observa (F4); observe desligado = tudo executa (estado final da F5).
     */
    executeJobs?: Set<string>;
}

export async function runSupervisor(opts: SupervisorOptions): Promise<void> {
    const admin = getAdmin();
    const id = workerId();

    // Boot: semear job_state e limpar execuções órfãs de um worker morto no deploy.
    await ensureJobState(admin);
    const reclaimed = await reclaimStaleRuns(admin);

    // Descreve o modo por job no boot — o operador confirma nos logs QUAL job está
    // executando de verdade antes de confiar. Ex.: "observe=true execute=[notifications-retention]".
    const executeList = opts.executeJobs && opts.executeJobs.size > 0
        ? `[${[...opts.executeJobs].join(",")}]`
        : "[]";
    notificationLog.info({
        op: "materialize",
        action: "supervisor",
        status: "boot",
        msg: `worker=${id} observe=${!!opts.observe} execute=${executeList} reclaimed=${reclaimed}`,
    });

    let lastTickDone = Date.now();
    let stopping = false;
    const children = new Set<ReturnType<typeof fork>>();

    // ── Self-watchdog: detecta o supervisor TRAVADO ──────────────────────────
    // Roda num timer independente. Se o último tick terminou há mais de 3× o intervalo,
    // o loop principal está preso em algo que não devia — e um processo residente preso
    // é invisível para o healthcheck do Compose. Melhor morrer e deixar o restart cuidar.
    const watchdog = setInterval(() => {
        if (stopping) return;
        if (Date.now() - lastTickDone > TICK_MS * WATCHDOG_FACTOR) {
            notificationLog.error({
                op: "materialize",
                action: "supervisor",
                status: "watchdog_kill",
                msg: `tick travado há >${(TICK_MS * WATCHDOG_FACTOR) / 1000}s — reiniciando`,
            });
            process.exit(1);
        }
    }, TICK_MS);
    watchdog.unref();

    // ── Shutdown gracioso ────────────────────────────────────────────────────
    // Deploy → SIGTERM. Fecha o portão (para de iniciar jobs) e espera os filhos
    // em curso. O que não terminar a tempo é morto pelo compose (SIGKILL após a graça);
    // o lease expira sozinho por TTL — a correção não depende do shutdown limpo.
    const shutdown = (sig: string) => {
        if (stopping) return;
        stopping = true;
        notificationLog.info({
            op: "materialize", action: "supervisor", status: "shutdown",
            msg: `${sig}: aguardando ${children.size} filho(s)`,
        });
        clearInterval(watchdog);
        // Não mata os filhos: deixa terminarem. O compose dá a janela de graça.
        const wait = setInterval(() => {
            if (children.size === 0) { clearInterval(wait); process.exit(0); }
        }, 500);
        wait.unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // ── Loop principal ───────────────────────────────────────────────────────
    // eslint-disable-next-line no-constant-condition
    while (!stopping) {
        touchHeartbeat(); // sinal de vida ANTES do trabalho do tick
        try {
            const due = await findDueJobs(admin, new Date());
            for (const { name } of due) {
                if (stopping) break;
                spawnChild(opts, name, children);
            }
        } catch (err) {
            // Um erro no scheduling NÃO derruba o supervisor — só loga e tenta no próximo tick.
            notificationLog.error({
                op: "materialize", action: "supervisor", status: "tick_error",
                msg: err instanceof Error ? err.message : "unknown",
            });
        }
        lastTickDone = Date.now();
        await sleep(TICK_MS);
    }
}

/** Forka um processo filho que roda UM job e sai. Memória e crash isolados. */
function spawnChild(
    opts: SupervisorOptions,
    job: string,
    children: Set<ReturnType<typeof fork>>,
) {
    // Observa se o global observe está ligado E este job NÃO está na allowlist de execução.
    const observe = !!opts.observe && !opts.executeJobs?.has(job);
    // `--scheduled`: marca que quem forka é o SUPERVISOR, não um humano no shell. Isenta os
    // jobs destrutivos do guard de --confirm (que existe só contra digitar `run
    // history-retention` à mão num shell de produção). As travas reais do agendado são a
    // allowlist WORKER_EXECUTE e o `enabled` no banco.
    const args = ["run", job, "--scheduled"];
    if (observe) args.push("--observe");

    const child = fork(opts.selfPath, args, { stdio: "inherit" });
    children.add(child);
    child.on("exit", () => children.delete(child));
    child.on("error", () => children.delete(child));
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export { workerId, getAdmin, isJobName };
