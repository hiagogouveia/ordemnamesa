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

    // ── s90: imutabilidade do payload/metadados ──────────────────────────────
    //
    // Antes do s90, `authenticated` tinha GRANT de UPDATE em TODAS as colunas e a
    // policy "Users can update own notifications" (USING auth.uid() = user_id)
    // autorizava — ou seja, o usuário podia reescrever type/title/payload da própria
    // notificação via PostgREST. Não era escalação de privilégio (o destino revalida
    // acesso no servidor), mas quebrava imutabilidade e corrompia a auditoria.
    //
    // O s90 fecha por PRIVILÉGIO DE COLUNA: só read/read_at são mutáveis.

    it("s90: staffA NÃO consegue reescrever o payload da própria notificação", async () => {
        const admin = createServiceClient();
        const ins = await admin
            .from("notifications")
            .insert({
                user_id: fx.staffA.id,
                restaurant_id: fx.restaurantA.id,
                type: "TASK_COMPLETED_WITH_NOTE",
                title: `immutable-payload-${fx.runId}`,
                payload: { checklist_id: "00000000-0000-0000-0000-000000000001" },
            })
            .select()
            .single();
        if (ins.error) throw new Error(ins.error.message);

        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("notifications")
            .update({ payload: { checklist_id: "deadbeef-forjado" } })
            .eq("id", ins.data.id)
            .select();
        expectRlsDenied(r, "staffA → UPDATE payload (deve ser imutável)");

        // E o payload no banco continua o original.
        const after = await admin
            .from("notifications")
            .select("payload")
            .eq("id", ins.data.id)
            .single();
        expect(after.data?.payload).toEqual({
            checklist_id: "00000000-0000-0000-0000-000000000001",
        });
    });

    it("s90: staffA NÃO consegue reescrever type/title da própria notificação", async () => {
        const admin = createServiceClient();
        const ins = await admin
            .from("notifications")
            .insert({
                user_id: fx.staffA.id,
                restaurant_id: fx.restaurantA.id,
                type: "TASK_COMPLETED_WITH_NOTE",
                title: `immutable-title-${fx.runId}`,
            })
            .select()
            .single();
        if (ins.error) throw new Error(ins.error.message);

        const sb = clientFor(fx.staffA);
        expectRlsDenied(
            await sb.from("notifications").update({ title: "forjado" }).eq("id", ins.data.id).select(),
            "staffA → UPDATE title",
        );
        expectRlsDenied(
            await sb.from("notifications").update({ type: "FORJADO" }).eq("id", ins.data.id).select(),
            "staffA → UPDATE type",
        );
    });

    it("s90: staffA AINDA consegue marcar a própria notificação como lida", async () => {
        // A contraparte: o hardening não pode ter quebrado o caso de uso legítimo.
        const admin = createServiceClient();
        const ins = await admin
            .from("notifications")
            .insert({
                user_id: fx.staffA.id,
                restaurant_id: fx.restaurantA.id,
                type: "TASK_COMPLETED_WITH_NOTE",
                title: `mark-read-${fx.runId}`,
            })
            .select()
            .single();
        if (ins.error) throw new Error(ins.error.message);

        const sb = clientFor(fx.staffA);
        const r = await sb
            .from("notifications")
            .update({ read: true, read_at: new Date().toISOString() })
            .eq("id", ins.data.id)
            .select();
        const rows = expectOk(r, "staffA → marcar como lida");
        expect(rows![0].read).toBe(true);
    });

    it("s90: domain_events é inacessível a authenticated (append-only, service_role)", async () => {
        const sb = clientFor(fx.managerA);
        expectRlsDenied(
            await sb.from("domain_events").select("id"),
            "managerA → SELECT domain_events",
        );
        expectRlsDenied(
            await sb.from("domain_events").insert({
                restaurant_id: fx.restaurantA.id,
                event_type: "Forjado",
                dedup_key: `forjado-${fx.runId}`,
            }).select(),
            "managerA → INSERT domain_events",
        );
    });
});
