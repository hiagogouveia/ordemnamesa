import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";
import { RETENTION, applyNotificationRetention } from "@/lib/notifications/retention";

/**
 * A retenção é destrutiva — então o que ela NÃO apaga importa tanto quanto o que apaga.
 *
 * A garantia central: eventos FALHADOS são retidos. Eles são a evidência de um bug, e
 * apagá-los destruiria exatamente a informação que o outbox existe para preservar.
 */
describe("s90 · retenção de notificações", () => {
    let fx: SecurityFixtures;
    const admin = createServiceClient();

    beforeAll(async () => {
        fx = await getSharedFixtures();
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    const ago = (days: number) =>
        new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    async function insertNotification(over: Record<string, unknown>) {
        const { data, error } = await admin
            .from("notifications")
            .insert({
                restaurant_id: fx.restaurantA.id,
                user_id: fx.ownerA.id,
                type: "TASK_COMPLETED_WITH_NOTE",
                title: `retencao-${fx.runId}`,
                ...over,
            })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }

    async function exists(table: string, id: string) {
        const { count } = await admin
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("id", id);
        return (count ?? 0) > 0;
    }

    it("apaga LIDAS antigas, preserva as recentes", async () => {
        const velhaLida = await insertNotification({
            read: true,
            created_at: ago(RETENTION.readDays + 5),
        });
        const recenteLida = await insertNotification({
            read: true,
            created_at: ago(RETENTION.readDays - 5),
        });

        await applyNotificationRetention({ admin });

        expect(await exists("notifications", velhaLida.id)).toBe(false);
        expect(await exists("notifications", recenteLida.id)).toBe(true);
    });

    it("NÃO apaga uma não-lida com a idade que já apagaria uma lida", async () => {
        // Não-lidas vivem mais (180d vs 90d): ainda são trabalho pendente do gestor.
        const naoLida = await insertNotification({
            read: false,
            created_at: ago(RETENTION.readDays + 5), // > 90d, < 180d
        });

        await applyNotificationRetention({ admin });

        expect(await exists("notifications", naoLida.id)).toBe(true);
    });

    it("apaga não-lidas realmente antigas (não acionáveis)", async () => {
        const antiquissima = await insertNotification({
            read: false,
            created_at: ago(RETENTION.unreadDays + 5),
        });

        await applyNotificationRetention({ admin });

        expect(await exists("notifications", antiquissima.id)).toBe(false);
    });

    it("RETÉM eventos FALHADOS — são evidência de bug, não lixo", async () => {
        // A garantia mais importante deste módulo. Um evento que esgotou as tentativas é
        // a prova de um problema; apagá-lo destruiria a única pista.
        const { data: falhado } = await admin
            .from("domain_events")
            .insert({
                restaurant_id: fx.restaurantA.id,
                event_type: "IssueReported",
                dedup_key: `retencao-falhado-${crypto.randomUUID()}`,
                status: "failed",
                last_error: "bug permanente",
                created_at: ago(RETENTION.processedEventDays + 100),
            })
            .select()
            .single();

        const { data: processado } = await admin
            .from("domain_events")
            .insert({
                restaurant_id: fx.restaurantA.id,
                event_type: "IssueReported",
                dedup_key: `retencao-processado-${crypto.randomUUID()}`,
                status: "processed",
                created_at: ago(RETENTION.processedEventDays + 100),
            })
            .select()
            .single();

        await applyNotificationRetention({ admin });

        expect(await exists("domain_events", falhado!.id)).toBe(true);   // preservado
        expect(await exists("domain_events", processado!.id)).toBe(false); // limpo
    });
});
