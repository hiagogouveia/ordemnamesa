import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { JOB_REGISTRY, JOB_NAMES, isJobOverdue } from "@/lib/jobs/registry";

export const dynamic = "force-dynamic";

/**
 * SAÚDE DOS JOBS — o dead-man's-switch, do lado de fora.
 *
 * ── A ideia central ──────────────────────────────────────────────────────────
 * A saúde do worker é observada ATRAVÉS DO BANCO, não através do worker. Este endpoint
 * roda no container WEB e lê `job_state`. Um worker morto ou travado NÃO consegue se
 * esconder: se ele parou de rodar, `last_success_at` envelhece, e nós vemos daqui — sem
 * o galinha-e-ovo de pedir a um processo morto que reporte a própria morte.
 *
 * ── O que "overdue" pega ─────────────────────────────────────────────────────
 * Um job é `overdue` se não teve sucesso dentro de 2× o seu intervalo. Essa única
 * condição, baseada em RESULTADO e não em processo, captura de uma vez: worker morto,
 * worker travado, job em loop de falha, banco inacessível pelo worker. É o que um monitor
 * externo precisa observar.
 *
 * ── Contrato ─────────────────────────────────────────────────────────────────
 * Veredito no STATUS HTTP: 200 se nenhum job habilitado está overdue, 503 se algum está.
 * Público e sem segredo (não expõe nada operacional — só nomes de job e flags).
 */

interface JobHealth {
    job: string;
    enabled: boolean;
    overdue: boolean;
    consecutive_failures: number;
    last_success_at: string | null;
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

export async function GET() {
    const sb = admin();
    const now = Date.now();

    const { data, error } = await sb
        .from("job_state")
        .select("job_name, enabled, last_success_at, consecutive_failures, updated_at");

    if (error) {
        // Não conseguimos LER o estado dos jobs → é degradação por si só.
        return NextResponse.json(
            { status: "degraded", error: "job_state inacessível" },
            { status: 503 },
        );
    }

    const byName = new Map((data ?? []).map((r) => [r.job_name as string, r]));
    const jobs: JobHealth[] = [];
    let anyOverdue = false;
    let workerSeenAt: number | null = null;

    for (const name of JOB_NAMES) {
        const row = byName.get(name);
        const def = JOB_REGISTRY[name];
        const enabled = row?.enabled ?? true;

        // O último sinal de vida do worker: o `updated_at` mais recente de qualquer linha
        // (o worker toca job_state a cada execução). Aproxima um heartbeat sem tabela extra.
        if (row?.updated_at) {
            const t = new Date(row.updated_at).getTime();
            if (workerSeenAt === null || t > workerSeenAt) workerSeenAt = t;
        }

        const overdue = isJobOverdue(
            def,
            {
                enabled,
                lastSuccessAtMs: row?.last_success_at ? new Date(row.last_success_at).getTime() : null,
                updatedAtMs: row?.updated_at ? new Date(row.updated_at).getTime() : null,
            },
            now,
        );

        if (overdue) anyOverdue = true;

        jobs.push({
            job: name,
            enabled,
            overdue,
            consecutive_failures: row?.consecutive_failures ?? 0,
            last_success_at: row?.last_success_at ?? null,
        });
    }

    return NextResponse.json(
        {
            status: anyOverdue ? "degraded" : "ok",
            worker: {
                last_seen_at: workerSeenAt ? new Date(workerSeenAt).toISOString() : null,
            },
            jobs,
        },
        { status: anyOverdue ? 503 : 200 },
    );
}
