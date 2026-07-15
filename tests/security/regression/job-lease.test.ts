import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import { createServiceClient } from "../helpers/supabase";
import {
    acquireLease,
    ensureJobState,
    findDueJobs,
    releaseLease,
} from "@/lib/jobs/lease";

/**
 * O LEASE é a coordenação que impede dois workers de rodar o mesmo job. Ele SÓ funciona
 * se o `UPDATE ... WHERE (lease livre)` for atômico no Postgres — e advisory locks não
 * serviriam neste stack (session-scoped + pooler). Estes testes provam a atomicidade
 * contra o banco real, que é o único lugar onde ela pode ser verdadeira ou falsa.
 */
describe("s91 · lease de jobs (coordenação distribuída)", () => {
    const admin = createServiceClient();

    beforeAll(async () => {
        // Só precisa das tabelas job_*; as fixtures garantem o schema provisionado.
        await getSharedFixtures();
        await ensureJobState(admin);
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    // "livre" = sentinela no passado, NÃO null (o lease usa `.lt(locked_until, now)`, e
    // uma comparação com null é sempre false → ninguém pegaria o lease).
    async function resetLease(job: string) {
        await admin
            .from("job_state")
            .update({
                locked_by: null,
                locked_until: "1970-01-01T00:00:00Z",
                last_run_at: null,
                last_success_at: null,
                consecutive_failures: 0,
            })
            .eq("job_name", job);
    }

    it("ensureJobState semeia as 6 linhas (idempotente)", async () => {
        await ensureJobState(admin); // 2ª vez não duplica
        const { count } = await admin
            .from("job_state")
            .select("job_name", { count: "exact", head: true });
        expect(count).toBeGreaterThanOrEqual(6);
    });

    it("CONCORRÊNCIA: dois workers disputam o mesmo lease — só UM vence", async () => {
        const job = "routines-delayed";
        await resetLease(job);
        const now = new Date();

        // Simula dois workers correndo pelo mesmo job ao mesmo tempo.
        const [a, b] = await Promise.all([
            acquireLease(admin, job, "worker-A", now),
            acquireLease(admin, job, "worker-B", now),
        ]);

        // Exatamente um venceu. Nunca os dois, nunca nenhum.
        expect([a, b].filter(Boolean)).toHaveLength(1);

        // E o dono registrado no banco é o vencedor.
        const { data } = await admin
            .from("job_state")
            .select("locked_by")
            .eq("job_name", job)
            .single();
        expect(data?.locked_by).toBe(a ? "worker-A" : "worker-B");
    });

    it("um lease ativo BLOQUEIA um terceiro worker até expirar", async () => {
        const job = "domain-events";
        await resetLease(job);
        const now = new Date();

        expect(await acquireLease(admin, job, "worker-A", now)).toBe(true);
        // Enquanto o lease de A vale, B não consegue.
        expect(await acquireLease(admin, job, "worker-B", now)).toBe(false);
    });

    it("lease EXPIRADO (worker morreu) é retomável por outro", async () => {
        const job = "admin-notifications";
        await resetLease(job);

        // A pega o lease, mas "morre" — forçamos o locked_until para o passado.
        await acquireLease(admin, job, "worker-A", new Date());
        await admin
            .from("job_state")
            .update({ locked_until: new Date(Date.now() - 1000).toISOString() })
            .eq("job_name", job);

        // B agora consegue: o TTL cobre o worker que não liberou o lease.
        expect(await acquireLease(admin, job, "worker-B", new Date())).toBe(true);
    });

    it("findDueJobs: job nunca rodado está vencido (recuperação após reboot)", async () => {
        const job = "photo-retention";
        await resetLease(job); // last_run_at = null

        const due = await findDueJobs(admin, new Date());
        expect(due.map((d) => d.name)).toContain(job);
    });

    it("findDueJobs: kill switch (enabled=false) tira o job da fila", async () => {
        const job = "history-retention";
        await resetLease(job);
        await admin.from("job_state").update({ enabled: false }).eq("job_name", job);

        const due = await findDueJobs(admin, new Date());
        expect(due.map((d) => d.name)).not.toContain(job);

        await admin.from("job_state").update({ enabled: true }).eq("job_name", job); // restaura
    });

    it("releaseLease(success) zera falhas e grava last_success_at; failure incrementa", async () => {
        const job = "notifications-retention";
        await resetLease(job);
        await acquireLease(admin, job, "worker-A", new Date());

        await releaseLease(admin, job, "failure", new Date());
        let row = await admin.from("job_state").select("*").eq("job_name", job).single();
        expect(row.data?.consecutive_failures).toBe(1);
        expect(row.data?.locked_by).toBeNull(); // lease liberado
        expect(row.data?.last_success_at).toBeNull();

        await acquireLease(admin, job, "worker-A", new Date());
        await releaseLease(admin, job, "success", new Date());
        row = await admin.from("job_state").select("*").eq("job_name", job).single();
        expect(row.data?.consecutive_failures).toBe(0);
        expect(row.data?.last_success_at).not.toBeNull();
    });
});
