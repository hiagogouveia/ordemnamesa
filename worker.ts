/**
 * WORKER — ponto de entrada do processo de jobs.
 *
 * Empacotado por esbuild em `dist/worker.js` (o `output: standalone` do Next só traça o
 * grafo da app, então este arquivo ficaria de fora sem um bundler próprio).
 *
 * Dois modos, um binário:
 *
 *   node dist/worker.js                 → SUPERVISOR (o loop residente; default do container)
 *   node dist/worker.js run <job>       → executa UM job e sai
 *   node dist/worker.js run <job> --observe   → idem, sem executar (modo observador, F4)
 *
 * O modo `run` serve a DOIS chamadores com o mesmo código: o filho que o supervisor
 * forka, e o disparo manual do operador (`docker compose exec worker node dist/worker.js
 * run <job> --confirm`). Um caminho, testado uma vez.
 */

import { fileURLToPath } from "url";
import { runSupervisor, getAdmin, workerId } from "@/lib/jobs/supervisor";
import { runJob } from "@/lib/jobs/runner";
import { JOB_REGISTRY, isJobName } from "@/lib/jobs/registry";

const SELF = fileURLToPath(import.meta.url);

async function main() {
    const [cmd, jobArg, ...rest] = process.argv.slice(2);
    const observe = rest.includes("--observe");
    const confirm = rest.includes("--confirm");

    if (cmd === "run") {
        if (!jobArg || !isJobName(jobArg)) {
            console.error(`Uso: worker.js run <job> [--observe] [--confirm]\nJobs: ${Object.keys(JOB_REGISTRY).join(", ")}`);
            process.exit(2);
        }

        // Jobs destrutivos (deleção irreversível) exigem --confirm no disparo MANUAL.
        // No fork do supervisor, `observe` ou o fluxo agendado normal não passam por aqui
        // como "manual" — o guard é para o operador, que digita o comando.
        if (JOB_REGISTRY[jobArg].destructive && !confirm && !observe) {
            console.error(`"${jobArg}" é destrutivo (deleção irreversível). Repita com --confirm.`);
            process.exit(3);
        }

        const report = await runJob(getAdmin(), jobArg, { workerId: workerId(), observe });
        console.log(JSON.stringify(report));
        // `skipped` (outro worker tinha o lease) e `noop` não são falha.
        process.exit(report.outcome === "failed" || report.outcome === "timeout" ? 1 : 0);
    }

    // Default: supervisor residente. O modo observador (F4) vem do ambiente
    // (WORKER_OBSERVE=1) — é o compose que decide, não o argv, para virar a chave na F5
    // removendo uma env var em vez de mudar o command.
    await runSupervisor({ selfPath: SELF, observe: observe || process.env.WORKER_OBSERVE === "1" });
}

main().catch((err) => {
    console.error("[worker] erro fatal:", err);
    process.exit(1);
});
