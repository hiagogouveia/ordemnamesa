import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";
import { detectDelayedRoutines } from "@/lib/notifications/detect-delayed";

/**
 * "Atrasado" é o único estado do domínio que NÃO é um fato registrado — é derivado do
 * relógio. Por isso é o único tipo que precisa de um cron.
 *
 * E é justamente por rodar em loop que ele é o mais perigoso: sem dedup, uma rotina
 * atrasada geraria um alerta A CADA VARREDURA. Estes testes travam essa garantia.
 */
describe("s90 · detecção de rotinas atrasadas (cron)", () => {
    let fx: SecurityFixtures;
    const admin = createServiceClient();

    beforeAll(async () => {
        fx = await getSharedFixtures();

        // Uma rotina que JÁ passou do horário-limite hoje: end_time no passado,
        // recorrência diária, com área (sem área o status vira 'incomplete').
        await admin
            .from("checklists")
            .update({
                end_time: "00:01",       // limite quase à meia-noite ⇒ já passou
                recurrence: "daily",
                active: true,
                area_id: fx.restaurantA.areaId,
            })
            .eq("id", fx.restaurantA.checklistId);
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    async function delayedEventsFor(checklistId: string) {
        const { data } = await admin
            .from("domain_events")
            .select("id, dedup_key")
            .eq("event_type", "RoutineDelayed")
            .like("dedup_key", `delayed:${checklistId}:%`);
        return data ?? [];
    }

    it("uma rotina fora do horário é detectada e notifica os gestores", async () => {
        const result = await detectDelayedRoutines({ admin, restaurantIds: [fx.restaurantA.id] });
        expect(result.checked).toBeGreaterThan(0);

        const events = await delayedEventsFor(fx.restaurantA.checklistId);
        expect(events.length).toBe(1);

        const notifs = await admin
            .from("notifications")
            .select("user_id, type, priority")
            .eq("event_id", events[0].id);

        const recipients = (notifs.data ?? []).map((n) => n.user_id);
        expect(recipients).toContain(fx.ownerA.id);
        expect(recipients).toContain(fx.managerA.id);
        // Staff não recebe (a Central é ferramenta de gestão).
        expect(recipients).not.toContain(fx.staffA.id);

        expect(notifs.data![0].type).toBe("ROUTINE_DELAYED");
        expect(notifs.data![0].priority).toBe("high");
    });

    it("IDEMPOTÊNCIA: rodar o cron 3× NÃO gera 3 alertas da mesma rotina", async () => {
        // O cenário que a dedup_key existe para impedir. O cron roda a cada 15 minutos:
        // sem `date_key` na chave, uma rotina atrasada acordaria o gestor o dia inteiro.
        await detectDelayedRoutines({ admin, restaurantIds: [fx.restaurantA.id, fx.restaurantB.id] });
        await detectDelayedRoutines({ admin, restaurantIds: [fx.restaurantA.id, fx.restaurantB.id] });
        await detectDelayedRoutines({ admin, restaurantIds: [fx.restaurantA.id, fx.restaurantB.id] });

        const events = await delayedEventsFor(fx.restaurantA.checklistId);
        expect(events.length).toBe(1); // UM evento, não quatro

        const { count } = await admin
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("event_id", events[0].id)
            .eq("user_id", fx.ownerA.id);

        expect(count).toBe(1); // UMA notificação por gestor, não quatro
    });

    it("rotina INATIVA não é notificada", async () => {
        await admin
            .from("checklists")
            .update({ active: false })
            .eq("id", fx.restaurantB.checklistId);

        await detectDelayedRoutines({ admin, restaurantIds: [fx.restaurantA.id, fx.restaurantB.id] });

        const events = await delayedEventsFor(fx.restaurantB.checklistId);
        expect(events.length).toBe(0);
    });
});
