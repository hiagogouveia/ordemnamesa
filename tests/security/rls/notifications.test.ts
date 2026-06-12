import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import { clientFor } from "../helpers/fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";
import { expectOk, expectRlsDenied } from "../helpers/assertions";

describe("RLS · notifications", () => {
    let fx: SecurityFixtures;

    beforeAll(async () => {
        fx = await getSharedFixtures();
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    it("authenticated NÃO consegue INSERT direto em notifications (s38 fechou WITH CHECK true)", async () => {
        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("notifications")
            .insert({
                user_id: fx.staffA.id,
                restaurant_id: fx.restaurantA.id,
                type: "test",
                title: "Should fail",
            })
            .select();
        expectRlsDenied(r, "staffA → INSERT notifications");
    });

    it("service_role inserindo notificação para staffA → staffA enxerga só a sua", async () => {
        const admin = createServiceClient();
        const ins = await admin.from("notifications").insert([
            {
                user_id: fx.staffA.id,
                restaurant_id: fx.restaurantA.id,
                type: "NEW_TASK_ASSIGNED", // s60 restringiu o CHECK aos tipos atuais
                title: `for-staffA-${fx.runId}`,
            },
            {
                user_id: fx.managerA.id,
                restaurant_id: fx.restaurantA.id,
                type: "NEW_TASK_ASSIGNED",
                title: `for-managerA-${fx.runId}`,
            },
        ]);
        if (ins.error) throw new Error(ins.error.message);

        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("notifications")
            .select("id, user_id, title")
            .like("title", `%${fx.runId}%`);
        const rows = expectOk(r, "staffA SELECT próprias notif");
        expect(rows!.every((row) => row.user_id === fx.staffA.id)).toBe(true);
        expect(rows!.length).toBe(1);
    });

    it("ownerB (outro tenant) não vê notificação dirigida a staffA", async () => {
        const sb = clientFor(fx.ownerB);
        const r = await sb
            .from("notifications")
            .select("id")
            .eq("user_id", fx.staffA.id);
        const rows = expectOk(r, "ownerB SELECT notif alheia");
        expect(rows!.length).toBe(0);
    });
});
