import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import { clientFor } from "../helpers/fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";

describe("RPC · replicate_checklists", () => {
    let fx: SecurityFixtures;

    beforeAll(async () => {
        fx = await getSharedFixtures();
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    it("ownerA replica de A para B (mesma account) — caminho legítimo", async () => {
        const sb = clientFor(fx.ownerA);
        const { data, error } = await sb.rpc("replicate_checklists", {
            p_checklist_ids: [fx.restaurantA.checklistId],
            p_target_restaurant_ids: [fx.restaurantB.id],
        });
        expect(error, `replicate legítimo erro: ${error?.message}`).toBeNull();
        expect(Array.isArray(data)).toBe(true);
        expect(data!.length).toBeGreaterThan(0);
        // ownerA também é owner da account alpha (account-level), então deve funcionar
        expect(data![0].status).toMatch(/created|skipped/);
    });

    it("ownerA NÃO consegue replicar para restaurante C (account distinta)", async () => {
        const sb = clientFor(fx.ownerA);
        const { error } = await sb.rpc("replicate_checklists", {
            p_checklist_ids: [fx.restaurantA.checklistId],
            p_target_restaurant_ids: [fx.restaurantC.id],
        });
        expect(error, "replicate cross-account deveria falhar").not.toBeNull();
        expect(error!.code === "42501" || /mesma account|negado/i.test(error!.message)).toBe(true);
    });

    it("staffA NÃO consegue replicar (não é owner/manager)", async () => {
        const sb = clientFor(fx.staffA);
        const { error } = await sb.rpc("replicate_checklists", {
            p_checklist_ids: [fx.restaurantA.checklistId],
            p_target_restaurant_ids: [fx.restaurantB.id],
        });
        expect(error, "staffA replicate deveria falhar").not.toBeNull();
        expect(error!.code === "42501" || /negado/i.test(error!.message)).toBe(true);
    });

    it("array vazio é rejeitado", async () => {
        const sb = clientFor(fx.ownerA);
        const { error } = await sb.rpc("replicate_checklists", {
            p_checklist_ids: [],
            p_target_restaurant_ids: [fx.restaurantB.id],
        });
        expect(error).not.toBeNull();
        expect(error!.code === "22023" || /vazio/i.test(error!.message)).toBe(true);
    });

    it("ownerB NÃO consegue replicar A→B sem ser owner também de A (sem account-level)", async () => {
        // ownerB é owner SOMENTE de B (não tem account_users em alpha, e não tem restaurant_users em A)
        const sb = clientFor(fx.ownerB);
        const { error } = await sb.rpc("replicate_checklists", {
            p_checklist_ids: [fx.restaurantA.checklistId],
            p_target_restaurant_ids: [fx.restaurantB.id],
        });
        expect(error, "ownerB sem membership em A deveria falhar").not.toBeNull();
        expect(error!.code === "42501" || /negado/i.test(error!.message)).toBe(true);
    });
});
