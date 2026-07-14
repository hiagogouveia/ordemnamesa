import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";
import { emitDomainEvent } from "@/lib/notifications/emit";
import type { IssuePayload } from "@/lib/notifications/contract";

/**
 * O HOTFIX do s90, verificado contra o banco real.
 *
 * Desde o s45 (maio/2026) reportar uma ocorrência NÃO gerava notificação nenhuma:
 * o único alerta que existia consultava `task_executions.status = 'blocked'`, status
 * que aquela mesma migration removeu do CHECK. A query retornava sempre `[]`, e o
 * gestor ficou às cegas por meses.
 *
 * Estes testes são a prova de que voltou a funcionar — e de que não vai duplicar.
 */
describe("s90 · emissão de notificações a partir de eventos de domínio", () => {
    let fx: SecurityFixtures;
    let taskId: string;

    const admin = createServiceClient();

    beforeAll(async () => {
        fx = await getSharedFixtures();

        const { data, error } = await admin
            .from("checklist_tasks")
            .insert({
                restaurant_id: fx.restaurantA.id,
                checklist_id: fx.restaurantA.checklistId,
                title: `task-emissao-${fx.runId}`,
                order: 1,
            })
            .select()
            .single();
        if (error) throw new Error(`fixture task: ${error.message}`);
        taskId = data.id;
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    function payload(over: Partial<IssuePayload> = {}): IssuePayload {
        return {
            issue_id: crypto.randomUUID(),
            checklist_id: fx.restaurantA.checklistId,
            checklist_assumption_id: null,
            date_key: "2026-07-14",
            task_id: taskId,
            severity: "blocker",
            reported_by_user_id: fx.staffA.id,
            checklist_name: "Abertura",
            task_title: "Conferir câmara",
            reported_by_name: "Staff A",
            excerpt: "porta não veda",
            ...over,
        };
    }

    it("impedimento reportado → evento + notificação para os gestores (não para o autor)", async () => {
        const p = payload();

        await emitDomainEvent(admin, "IssueReported", {
            restaurantId: fx.restaurantA.id,
            actorUserId: fx.staffA.id,
            payload: p,
        });

        // 1) O evento de domínio foi registrado e processado.
        const ev = await admin
            .from("domain_events")
            .select("id, status, event_type, dedup_key")
            .eq("dedup_key", `issue:${p.issue_id}`)
            .single();

        expect(ev.data?.event_type).toBe("IssueReported");
        expect(ev.data?.status).toBe("processed");

        // 2) As notificações nasceram do evento (mesmo event_id: correlation id).
        const notifs = await admin
            .from("notifications")
            .select("user_id, type, priority, payload, group_key, event_id")
            .eq("event_id", ev.data!.id);

        const recipients = (notifs.data ?? []).map((n) => n.user_id);

        // ownerA e managerA recebem; staffA (o autor) NÃO.
        expect(recipients).toContain(fx.ownerA.id);
        expect(recipients).toContain(fx.managerA.id);
        expect(recipients).not.toContain(fx.staffA.id);

        const n = notifs.data![0];
        expect(n.type).toBe("BLOCKER_REPORTED");
        expect(n.priority).toBe("critical"); // impedimento trava a operação
        expect(n.event_id).toBe(ev.data!.id);

        // 3) O payload carrega os IDs necessários para o deep-link determinístico.
        const pl = n.payload as IssuePayload;
        expect(pl.issue_id).toBe(p.issue_id);
        expect(pl.checklist_id).toBe(fx.restaurantA.checklistId);
        expect(pl.date_key).toBe("2026-07-14"); // é isto que destrava o histórico
        expect(pl.task_id).toBe(taskId);
    });

    it("ocorrência comum (severity normal) → tipo e prioridade DIFERENTES do impedimento", async () => {
        const p = payload({ severity: "normal" });

        await emitDomainEvent(admin, "IssueReported", {
            restaurantId: fx.restaurantA.id,
            actorUserId: fx.staffA.id,
            payload: p,
        });

        const ev = await admin
            .from("domain_events")
            .select("id")
            .eq("dedup_key", `issue:${p.issue_id}`)
            .single();

        const notifs = await admin
            .from("notifications")
            .select("type, priority")
            .eq("event_id", ev.data!.id);

        expect(notifs.data![0].type).toBe("ISSUE_REPORTED");
        expect(notifs.data![0].priority).toBe("high"); // alta, mas não crítica
    });

    it("IDEMPOTÊNCIA: emitir o MESMO evento duas vezes não duplica nada", async () => {
        // Cobre retry de rota, double-submit e cron sobreposto. A garantia vive no
        // índice UNIQUE(event_type, dedup_key) — não na memória da aplicação.
        const p = payload();

        await emitDomainEvent(admin, "IssueReported", {
            restaurantId: fx.restaurantA.id,
            actorUserId: fx.staffA.id,
            payload: p,
        });
        await emitDomainEvent(admin, "IssueReported", {
            restaurantId: fx.restaurantA.id,
            actorUserId: fx.staffA.id,
            payload: p,
        });

        const events = await admin
            .from("domain_events")
            .select("id")
            .eq("dedup_key", `issue:${p.issue_id}`);
        expect(events.data).toHaveLength(1);

        const notifs = await admin
            .from("notifications")
            .select("id, user_id")
            .eq("event_id", events.data![0].id);

        // Uma notificação por destinatário — nunca duas.
        const perUser = new Map<string, number>();
        for (const n of notifs.data ?? []) {
            perUser.set(n.user_id, (perUser.get(n.user_id) ?? 0) + 1);
        }
        for (const [, count] of perUser) expect(count).toBe(1);
    });

    it("o group_key permite agrupar ocorrências da mesma rotina no mesmo dia", async () => {
        const p = payload({ severity: "normal" });
        await emitDomainEvent(admin, "IssueReported", {
            restaurantId: fx.restaurantA.id,
            actorUserId: fx.staffA.id,
            payload: p,
        });

        const ev = await admin
            .from("domain_events")
            .select("id")
            .eq("dedup_key", `issue:${p.issue_id}`)
            .single();

        const notifs = await admin
            .from("notifications")
            .select("group_key")
            .eq("event_id", ev.data!.id);

        expect(notifs.data![0].group_key).toBe(
            `issue:${fx.restaurantA.checklistId}:2026-07-14`,
        );
    });

    it("o payload NÃO vaza para outro tenant", async () => {
        const p = payload();
        await emitDomainEvent(admin, "IssueReported", {
            restaurantId: fx.restaurantA.id,
            actorUserId: fx.staffA.id,
            payload: p,
        });

        const ev = await admin
            .from("domain_events")
            .select("id")
            .eq("dedup_key", `issue:${p.issue_id}`)
            .single();

        const notifs = await admin
            .from("notifications")
            .select("user_id, restaurant_id")
            .eq("event_id", ev.data!.id);

        // ownerC é de outra ACCOUNT; ownerB é de outro restaurante.
        const recipients = (notifs.data ?? []).map((n) => n.user_id);
        expect(recipients).not.toContain(fx.ownerC.id);
        expect(recipients).not.toContain(fx.ownerB.id);
        expect((notifs.data ?? []).every((n) => n.restaurant_id === fx.restaurantA.id)).toBe(true);
    });
});
