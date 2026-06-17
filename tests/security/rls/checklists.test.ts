import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import { clientFor } from "../helpers/fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { expectCrossTenantDenied, expectOk, expectRlsDenied } from "../helpers/assertions";

describe("RLS · checklists", () => {
    let fx: SecurityFixtures;

    beforeAll(async () => {
        fx = await getSharedFixtures();
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    it("ownerA enxerga seu próprio checklist do restaurante A", async () => {
        const sb = clientFor(fx.ownerA);
        const r = await sb
            .from("checklists")
            .select("id, restaurant_id")
            .eq("id", fx.restaurantA.checklistId);
        const rows = expectOk(r);
        expect(rows).toHaveLength(1);
        expect(rows![0].restaurant_id).toBe(fx.restaurantA.id);
    });

    it("ownerA NÃO enxerga checklists do restaurante B (cross-tenant SELECT bloqueado)", async () => {
        const sb = clientFor(fx.ownerA);
        const r = await sb
            .from("checklists")
            .select("id")
            .eq("restaurant_id", fx.restaurantB.id);
        expectCrossTenantDenied(r, "ownerA → checklists de B");
    });

    it("ownerA NÃO consegue UPDATE em checklist do restaurante B", async () => {
        const sb = clientFor(fx.ownerA);
        const r = await sb
            .from("checklists")
            .update({ name: "hijack-attempt" })
            .eq("id", fx.restaurantB.checklistId)
            .select();
        expectRlsDenied(r, "ownerA → UPDATE checklist de B");
    });

    it("staffA NÃO consegue UPDATE em checklist do restaurante A (apenas owner/manager)", async () => {
        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("checklists")
            .update({ name: "staff-cant-edit" })
            .eq("id", fx.restaurantA.checklistId)
            .select();
        expectRlsDenied(r, "staffA → UPDATE checklist do próprio tenant");
    });

    it("managerA CONSEGUE UPDATE em checklist do restaurante A", async () => {
        const sb = clientFor(fx.managerA);
        const r = await sb
            .from("checklists")
            .update({ description: `manager-edit-${fx.runId}` })
            .eq("id", fx.restaurantA.checklistId)
            .select();
        const rows = expectOk(r, "managerA → UPDATE");
        expect(rows!.length).toBeGreaterThan(0);
    });

    it("usuário inativo do restaurante A NÃO enxerga checklists (active=false barra)", async () => {
        const sb = clientFor(fx.inactiveA);
        const r = await sb.from("checklists").select("id");
        expectCrossTenantDenied(r, "inactiveA");
    });
});
