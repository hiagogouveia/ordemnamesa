// Regressão — Retenção de histórico de execução (s86).
//
// Garante que purge_expired_history apaga SÓ o histórico > N dias e NUNCA toca definições de rotina
// nem o "recebimento em si" (checklists checklist_type='receiving' / receiving_templates), nem nada
// recente. Roda contra NONPROD com dados semeados (idades controladas).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

describe("Regressão · retenção de histórico (60 dias)", () => {
    let fx: SecurityFixtures;
    const admin = createServiceClient();

    // checklist do tipo 'receiving' — o "recebimento em si" deve sobreviver à retenção.
    let receivingChecklistId: string;
    let oldTaskId: string;
    let oldAssumptionId: string;
    let oldExecutionId: string;
    let recentAssumptionId: string;
    let recentExecutionId: string;
    // Edge: sessão ANTIGA (90d) que ainda tem execução RECENTE (10d) — deve ser PRESERVADA.
    let edgeAssumptionId: string;
    let edgeRecentExecutionId: string;

    beforeAll(async () => {
        fx = await getSharedFixtures();

        const rc = await admin
            .from("checklists")
            .insert({
                restaurant_id: fx.restaurantA.id,
                name: "Recebimento Hortifruti (teste retenção)",
                shift: "morning",
                checklist_type: "receiving",
                active: true,
                area_id: fx.restaurantA.areaId,
                created_by: fx.ownerA.id,
            })
            .select("id")
            .single();
        if (rc.error) throw new Error(`receiving checklist: ${rc.error.message}`);
        receivingChecklistId = rc.data.id;

        const t = await admin
            .from("checklist_tasks")
            .insert({
                checklist_id: receivingChecklistId,
                restaurant_id: fx.restaurantA.id,
                title: "Conferir nota fiscal",
                order: 0,
            })
            .select("id")
            .single();
        if (t.error) throw new Error(`task: ${t.error.message}`);
        oldTaskId = t.data.id;

        // Histórico ANTIGO (90 dias) — deve ser apagado
        const oldA = await admin.from("checklist_assumptions").insert({
            checklist_id: receivingChecklistId, restaurant_id: fx.restaurantA.id,
            user_id: fx.staffA.id, user_name: "Staff A", date_key: "2026-04-01",
            assumed_at: daysAgo(90), completed_at: daysAgo(90), execution_status: "done",
        }).select("id").single();
        if (oldA.error) throw new Error(`old assumption: ${oldA.error.message}`);
        oldAssumptionId = oldA.data.id;

        const oldE = await admin.from("task_executions").insert({
            restaurant_id: fx.restaurantA.id, task_id: oldTaskId, checklist_id: receivingChecklistId,
            checklist_assumption_id: oldAssumptionId, user_id: fx.staffA.id,
            status: "done", executed_at: daysAgo(90),
        }).select("id").single();
        if (oldE.error) throw new Error(`old execution: ${oldE.error.message}`);
        oldExecutionId = oldE.data.id;

        // Histórico RECENTE (30 dias) — deve sobreviver
        const recA = await admin.from("checklist_assumptions").insert({
            checklist_id: receivingChecklistId, restaurant_id: fx.restaurantA.id,
            user_id: fx.staffA.id, user_name: "Staff A", date_key: "2026-05-31",
            assumed_at: daysAgo(30), completed_at: daysAgo(30), execution_status: "done",
        }).select("id").single();
        if (recA.error) throw new Error(`recent assumption: ${recA.error.message}`);
        recentAssumptionId = recA.data.id;

        const recE = await admin.from("task_executions").insert({
            restaurant_id: fx.restaurantA.id, task_id: oldTaskId, checklist_id: receivingChecklistId,
            checklist_assumption_id: recentAssumptionId, user_id: fx.staffA.id,
            status: "done", executed_at: daysAgo(30),
        }).select("id").single();
        if (recE.error) throw new Error(`recent execution: ${recE.error.message}`);
        recentExecutionId = recE.data.id;

        // Edge: assumption ANTIGA (90d) com execução RECENTE (10d) vinculada.
        const edgeA = await admin.from("checklist_assumptions").insert({
            checklist_id: receivingChecklistId, restaurant_id: fx.restaurantA.id,
            user_id: fx.staffA.id, user_name: "Staff A", date_key: "2026-04-02",
            assumed_at: daysAgo(90), completed_at: null, execution_status: "in_progress",
        }).select("id").single();
        if (edgeA.error) throw new Error(`edge assumption: ${edgeA.error.message}`);
        edgeAssumptionId = edgeA.data.id;

        const edgeE = await admin.from("task_executions").insert({
            restaurant_id: fx.restaurantA.id, task_id: oldTaskId, checklist_id: receivingChecklistId,
            checklist_assumption_id: edgeAssumptionId, user_id: fx.staffA.id,
            status: "done", executed_at: daysAgo(10),
        }).select("id").single();
        if (edgeE.error) throw new Error(`edge recent execution: ${edgeE.error.message}`);
        edgeRecentExecutionId = edgeE.data.id;
    });

    afterAll(async () => {
        await admin.rpc("admin_purge_history_for_restaurants", { p_restaurant_ids: [fx.restaurantA.id] });
        await admin.from("checklist_tasks").delete().eq("id", oldTaskId);
        await admin.from("checklists").delete().eq("id", receivingChecklistId);
        await teardownSharedFixtures();
    });

    it("dry_run conta o histórico antigo e NÃO apaga nada", async () => {
        const r = await admin.rpc("purge_expired_history", { retention_days: 60, dry_run: true });
        expect(r.error).toBeNull();
        expect(r.data.dry_run).toBe(true);
        expect(Number(r.data.executions)).toBeGreaterThanOrEqual(1);
        expect(Number(r.data.assumptions)).toBeGreaterThanOrEqual(1);

        // Nada foi apagado
        const still = await admin.from("task_executions").select("id").eq("id", oldExecutionId).maybeSingle();
        expect(still.data?.id).toBe(oldExecutionId);
    });

    it("real: apaga >60d, preserva <60d, e NÃO toca a definição da rotina nem o recebimento", async () => {
        const r = await admin.rpc("purge_expired_history", { retention_days: 60, dry_run: false });
        expect(r.error).toBeNull();
        expect(Number(r.data.executions_deleted)).toBeGreaterThanOrEqual(1);

        // Antigo apagado
        const oldExec = await admin.from("task_executions").select("id").eq("id", oldExecutionId).maybeSingle();
        const oldAss = await admin.from("checklist_assumptions").select("id").eq("id", oldAssumptionId).maybeSingle();
        expect(oldExec.data).toBeNull();
        expect(oldAss.data).toBeNull();

        // Recente preservado
        const recExec = await admin.from("task_executions").select("id").eq("id", recentExecutionId).maybeSingle();
        const recAss = await admin.from("checklist_assumptions").select("id").eq("id", recentAssumptionId).maybeSingle();
        expect(recExec.data?.id).toBe(recentExecutionId);
        expect(recAss.data?.id).toBe(recentAssumptionId);

        // Definição da rotina e a tarefa (o "recebimento em si") intactas
        const cl = await admin.from("checklists").select("id, checklist_type, active").eq("id", receivingChecklistId).maybeSingle();
        expect(cl.data?.id).toBe(receivingChecklistId);
        expect(cl.data?.checklist_type).toBe("receiving");
        const task = await admin.from("checklist_tasks").select("id").eq("id", oldTaskId).maybeSingle();
        expect(task.data?.id).toBe(oldTaskId);
    });

    it("edge: sessão antiga com execução recente é PRESERVADA (nunca apaga nada recente; FK-safe)", async () => {
        // Após o purge do teste anterior: a execução recente (10d) sobrevive, e a assumption antiga
        // não é apagada porque ainda tem execução recente vinculada.
        const edgeExec = await admin.from("task_executions").select("id").eq("id", edgeRecentExecutionId).maybeSingle();
        const edgeAss = await admin.from("checklist_assumptions").select("id").eq("id", edgeAssumptionId).maybeSingle();
        expect(edgeExec.data?.id).toBe(edgeRecentExecutionId);
        expect(edgeAss.data?.id).toBe(edgeAssumptionId);
    });
});
