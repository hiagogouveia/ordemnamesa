import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import { clientFor } from "../helpers/fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";
import { expectOk, expectRlsDenied } from "../helpers/assertions";

describe("RLS · task_executions", () => {
    let fx: SecurityFixtures;
    let taskA: string;
    let taskB: string;

    beforeAll(async () => {
        fx = await getSharedFixtures();
        const admin = createServiceClient();
        const tA = await admin
            .from("checklist_tasks")
            .insert({
                checklist_id: fx.restaurantA.checklistId,
                restaurant_id: fx.restaurantA.id,
                title: "Task A",
                order: 1,
            })
            .select("id")
            .single();
        const tB = await admin
            .from("checklist_tasks")
            .insert({
                checklist_id: fx.restaurantB.checklistId,
                restaurant_id: fx.restaurantB.id,
                title: "Task B",
                order: 1,
            })
            .select("id")
            .single();
        if (tA.error || tB.error) {
            throw new Error(
                `setup tasks: ${tA.error?.message ?? ""} ${tB.error?.message ?? ""}`,
            );
        }
        taskA = tA.data!.id;
        taskB = tB.data!.id;
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    it("staffA insere execução em A com seu próprio user_id (caminho legítimo)", async () => {
        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("task_executions")
            .insert({
                task_id: taskA,
                checklist_id: fx.restaurantA.checklistId,
                restaurant_id: fx.restaurantA.id,
                user_id: fx.staffA.id,
                status: "done", // NOT NULL no schema atual
                executed_at: new Date().toISOString(),
            })
            .select();
        expectOk(r, "staffA INSERT próprio");
    });

    it("staffA NÃO consegue inserir execução atribuindo user_id de outro colega (P1)", async () => {
        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("task_executions")
            .insert({
                task_id: taskA,
                checklist_id: fx.restaurantA.checklistId,
                restaurant_id: fx.restaurantA.id,
                user_id: fx.managerA.id, // tentando atribuir a outro user
                status: "done",
                executed_at: new Date().toISOString(),
            })
            .select();
        expectRlsDenied(r, "staffA → INSERT com user_id alheio");
    });

    it("staffA NÃO consegue inserir execução em restaurante B (cross-tenant)", async () => {
        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("task_executions")
            .insert({
                task_id: taskB,
                checklist_id: fx.restaurantB.checklistId,
                restaurant_id: fx.restaurantB.id,
                user_id: fx.staffA.id,
                status: "done",
                executed_at: new Date().toISOString(),
            })
            .select();
        expectRlsDenied(r, "staffA → INSERT em B");
    });

    it("staffA só vê suas próprias execuções (não as de managerA)", async () => {
        const admin = createServiceClient();
        // managerA executa via service role para criar evidência
        const seed = await admin.from("task_executions").insert({
            task_id: taskA,
            checklist_id: fx.restaurantA.checklistId,
            restaurant_id: fx.restaurantA.id,
            user_id: fx.managerA.id,
            status: "done",
            executed_at: new Date().toISOString(),
        });
        if (seed.error) throw new Error(`seed managerA falhou: ${seed.error.message}`);

        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("task_executions")
            .select("id, user_id")
            .eq("restaurant_id", fx.restaurantA.id);
        const rows = expectOk(r, "staffA SELECT próprio tenant");
        expect(rows!.every((row) => row.user_id === fx.staffA.id)).toBe(true);
    });

    it("ownerA vê execuções de toda a equipe do restaurante A (owner override)", async () => {
        const sb = clientFor(fx.ownerA);
        const r = await sb
            .from("task_executions")
            .select("id, user_id")
            .eq("restaurant_id", fx.restaurantA.id);
        const rows = expectOk(r, "ownerA SELECT");
        // Tem que ter pelo menos a execução de staffA + managerA
        const distinctUsers = new Set(rows!.map((row) => row.user_id));
        expect(distinctUsers.size).toBeGreaterThanOrEqual(2);
    });
});
