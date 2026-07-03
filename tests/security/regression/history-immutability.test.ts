// Regressão — Imutabilidade do histórico auditável (s84/s85) + fidelidade da Auditoria.
//
// Cobre os cenários do hardening contra dados reais (NONPROD):
//  1. Executar tarefa -> finalizar -> Auditoria mostra o detalhamento.
//  2. Reset/limpeza não apaga execução concluída (trigger bloqueia DELETE de período fechado).
//  3. Sessão concluída é imutável (UPDATE/DELETE bloqueados); opt-in libera manutenção.
//  4. Cada assumption mantém suas task_executions (vínculo canônico).
//  5. Fidelidade histórica: renomear a tarefa depois NÃO altera a auditoria antiga (snapshot).
//
// O fluxo é montado via service client (a engine de execução já é coberta por outros testes);
// o foco aqui é a imutabilidade no banco e a leitura fiel pela Auditoria.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";
import { fetchAuditDetail } from "@/lib/services/audit-service";

describe("Regressão · imutabilidade do histórico + fidelidade da Auditoria", () => {
    let fx: SecurityFixtures;
    const admin = createServiceClient();
    const createdRestaurantIds = new Set<string>();

    let taskId: string;
    let assumptionId: string;
    let executionId: string;
    const ORIGINAL_TITLE = "Conferir temperatura da câmara fria";

    beforeAll(async () => {
        fx = await getSharedFixtures();
        createdRestaurantIds.add(fx.restaurantA.id);

        // Tarefa da rotina
        const t = await admin
            .from("checklist_tasks")
            .insert({
                checklist_id: fx.restaurantA.checklistId,
                restaurant_id: fx.restaurantA.id,
                title: ORIGINAL_TITLE,
                description: "Registrar a temperatura no início do turno.",
                is_critical: true,
                order: 0,
            })
            .select("id")
            .single();
        if (t.error) throw new Error(`task: ${t.error.message}`);
        taskId = t.data.id;

        // Sessão (assumption) ABERTA do dia
        const a = await admin
            .from("checklist_assumptions")
            .insert({
                checklist_id: fx.restaurantA.checklistId,
                restaurant_id: fx.restaurantA.id,
                user_id: fx.staffA.id,
                user_name: "Staff A",
                date_key: "2026-06-30",
                assumed_at: new Date().toISOString(),
            })
            .select("id")
            .single();
        if (a.error) throw new Error(`assumption: ${a.error.message}`);
        assumptionId = a.data.id;

        // Execução concluída, vinculada e com SNAPSHOT da identidade da tarefa
        const e = await admin
            .from("task_executions")
            .insert({
                restaurant_id: fx.restaurantA.id,
                task_id: taskId,
                checklist_id: fx.restaurantA.checklistId,
                checklist_assumption_id: assumptionId,
                user_id: fx.staffA.id,
                status: "done",
                executed_at: new Date().toISOString(),
                task_title_snapshot: ORIGINAL_TITLE,
                task_description_snapshot: "Registrar a temperatura no início do turno.",
                is_critical_snapshot: true,
            })
            .select("id")
            .single();
        if (e.error) throw new Error(`execution: ${e.error.message}`);
        executionId = e.data.id;
    });

    afterAll(async () => {
        // Limpa o histórico criado por este arquivo via o caminho de manutenção sancionado (opt-in).
        await admin.rpc("admin_purge_history_for_restaurants", {
            p_restaurant_ids: Array.from(createdRestaurantIds),
        });
        await admin.from("checklist_tasks").delete().eq("id", taskId);
        await teardownSharedFixtures();
    });

    it("Cenário 1 — sessão aberta: a execução é editável (correção do dia)", async () => {
        const r = await admin
            .from("task_executions")
            .update({ observation: "ok" })
            .eq("id", executionId)
            .select("id");
        expect(r.error).toBeNull();
    });

    it("Cenário 1 — após finalizar, a Auditoria mostra o detalhamento da execução", async () => {
        const fin = await admin
            .from("checklist_assumptions")
            .update({ completed_at: new Date().toISOString(), execution_status: "done" })
            .eq("id", assumptionId)
            .select("id");
        expect(fin.error).toBeNull(); // finalização (OLD.completed_at null) é permitida

        const detail = await fetchAuditDetail(admin, assumptionId, [fx.restaurantA.id], {}, false);
        expect(detail).not.toBeNull();
        const task = detail!.tasks.find((t) => t.task_id === taskId);
        expect(task).toBeDefined();
        expect(task!.execution_id).toBe(executionId);
        expect(task!.status).toBe("completed");
    });

    it("Cenário 2/3 — execução de sessão concluída NÃO pode ser apagada (trigger)", async () => {
        const del = await admin.from("task_executions").delete().eq("id", executionId).select("id");
        expect(del.error).not.toBeNull();
        expect(del.error!.message).toMatch(/IMUTABILIDADE/i);
        // E continua existindo
        const still = await admin.from("task_executions").select("id").eq("id", executionId).maybeSingle();
        expect(still.data?.id).toBe(executionId);
    });

    it("Cenário 3 — execução de sessão concluída NÃO pode ser alterada (trigger)", async () => {
        const upd = await admin
            .from("task_executions")
            .update({ observation: "tentativa pós-fechamento" })
            .eq("id", executionId)
            .select("id");
        expect(upd.error).not.toBeNull();
        expect(upd.error!.message).toMatch(/IMUTABILIDADE/i);
    });

    it("Cenário 3 — sessão concluída (assumption) é imutável", async () => {
        const upd = await admin
            .from("checklist_assumptions")
            .update({ user_name: "alterado" })
            .eq("id", assumptionId)
            .select("id");
        expect(upd.error).not.toBeNull();
        expect(upd.error!.message).toMatch(/IMUTABILIDADE/i);
    });

    it("Cenário 5 — renomear a tarefa depois NÃO altera a Auditoria antiga (snapshot)", async () => {
        const ren = await admin
            .from("checklist_tasks")
            .update({ title: "TÍTULO NOVO EDITADO" })
            .eq("id", taskId)
            .select("id");
        expect(ren.error).toBeNull();

        const detail = await fetchAuditDetail(admin, assumptionId, [fx.restaurantA.id], {}, false);
        const task = detail!.tasks.find((t) => t.task_id === taskId);
        // A Auditoria deve refletir o título DA ÉPOCA (snapshot), não o atual.
        expect(task!.title).toBe(ORIGINAL_TITLE);
    });

    it("manutenção sancionada (opt-in RPC) consegue remover histórico — escape controlado", async () => {
        const purge = await admin.rpc("admin_purge_history_for_restaurants", {
            p_restaurant_ids: [fx.restaurantA.id],
        });
        expect(purge.error).toBeNull();
        const gone = await admin.from("task_executions").select("id").eq("id", executionId).maybeSingle();
        expect(gone.data).toBeNull();
    });
});
