import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";
import { processDomainEventsOutbox } from "@/lib/notifications/process";

/**
 * O outbox como REDE DE SEGURANÇA.
 *
 * Antes do s90, uma falha ao criar a notificação era engolida por um `catch` e a
 * notificação sumia sem rastro. Aqui provamos o contrário: um evento que ficou
 * `pending` (materialização falhou) é REENTREGUE pelo cron.
 *
 * Isto não é teórico — na F2 um bug real (índice UNIQUE parcial, incompatível com
 * ON CONFLICT) deixou eventos pendentes com `last_error` preenchido. Foi assim que
 * o diagnóstico saiu em um comando, em vez de virar "as notificações sumiram".
 */
describe("s90 · outbox de eventos de domínio (retry)", () => {
    let fx: SecurityFixtures;
    const admin = createServiceClient();

    beforeAll(async () => {
        fx = await getSharedFixtures();
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    async function insertPendingEvent(over: Record<string, unknown> = {}) {
        const { data, error } = await admin
            .from("domain_events")
            .insert({
                restaurant_id: fx.restaurantA.id,
                event_type: "RoutineDelayed",
                dedup_key: `outbox-test-${crypto.randomUUID()}`,
                actor_user_id: null,
                status: "pending",
                payload: {
                    checklist_id: fx.restaurantA.checklistId,
                    checklist_assumption_id: null,
                    date_key: "2026-07-14",
                    checklist_name: "Fechamento",
                    area_name: null,
                },
                ...over,
            })
            .select()
            .single();
        if (error) throw new Error(`fixture evento: ${error.message}`);
        return data;
    }

    it("evento pendente é materializado pelo cron (reentrega)", async () => {
        const ev = await insertPendingEvent();

        const result = await processDomainEventsOutbox({ limit: 50, admin });
        expect(result.processed).toBeGreaterThanOrEqual(1);

        const after = await admin
            .from("domain_events")
            .select("status, attempts, processed_at, last_error")
            .eq("id", ev.id)
            .single();

        expect(after.data?.status).toBe("processed");
        expect(after.data?.attempts).toBe(1);
        expect(after.data?.last_error).toBeNull();

        // E as notificações realmente existem, ligadas ao evento pelo event_id.
        const notifs = await admin
            .from("notifications")
            .select("user_id, type, priority")
            .eq("event_id", ev.id);

        expect(notifs.data!.length).toBeGreaterThan(0);
        expect(notifs.data![0].type).toBe("ROUTINE_DELAYED");
        expect(notifs.data![0].priority).toBe("high");
    });

    it("reprocessar um evento JÁ processado não duplica notificações", async () => {
        const ev = await insertPendingEvent();
        await processDomainEventsOutbox({ limit: 50, admin });

        const before = await admin
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("event_id", ev.id);

        // Força uma nova rodada sobre o mesmo evento.
        await admin.from("domain_events").update({ status: "pending" }).eq("id", ev.id);
        await processDomainEventsOutbox({ limit: 50, admin });

        const after = await admin
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("event_id", ev.id);

        // A garantia vive no índice UNIQUE(event_id, user_id) — não na memória da app.
        expect(after.count).toBe(before.count);
    });

    it("evento com bug permanente esgota as tentativas e vira `failed` (terminal)", async () => {
        // Um evento cujo tipo não tem handler jamais será materializado. Sem um estado
        // terminal, o cron o retentaria a cada 5 minutos, para sempre.
        const ev = await insertPendingEvent({
            event_type: "EventoInexistente",
            max_attempts: 2,
        });

        // 1ª tentativa → volta para pending, com backoff
        await processDomainEventsOutbox({ limit: 50, admin });
        let row = await admin
            .from("domain_events")
            .select("status, attempts, last_error, next_attempt_at")
            .eq("id", ev.id)
            .single();
        expect(row.data?.status).toBe("pending");
        expect(row.data?.attempts).toBe(1);
        expect(row.data?.last_error).toMatch(/sem handler/i);

        // O backoff empurrou o próximo attempt para o futuro: a rodada seguinte NÃO o pega.
        const skipped = await processDomainEventsOutbox({ limit: 50, admin });
        const stillOne = await admin
            .from("domain_events")
            .select("attempts")
            .eq("id", ev.id)
            .single();
        expect(stillOne.data?.attempts).toBe(1);
        expect(skipped.picked).toBe(0);

        // Forçando a elegibilidade, a 2ª tentativa esgota → terminal.
        await admin
            .from("domain_events")
            .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
            .eq("id", ev.id);

        const result = await processDomainEventsOutbox({ limit: 50, admin });
        expect(result.exhausted).toBe(1);

        row = await admin
            .from("domain_events")
            .select("status, attempts, last_error, next_attempt_at")
            .eq("id", ev.id)
            .single();
        expect(row.data?.status).toBe("failed");
        expect(row.data?.attempts).toBe(2);

        // E `failed` NÃO é repescado — é evidência do bug, não trabalho pendente.
        const again = await processDomainEventsOutbox({ limit: 50, admin });
        expect(again.picked).toBe(0);
    });
});
