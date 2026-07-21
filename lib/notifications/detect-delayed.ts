import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getNowInTz } from "@/lib/utils/brazil-date";
import { getOperationalStatus } from "@/lib/utils/get-operational-status";
import { fetchChecklistViews } from "@/lib/services/checklist-view";
import { emitDomainEvent } from "./emit";
import { notificationLog } from "./log";

/**
 * DETECÇÃO DE ROTINAS ATRASADAS.
 *
 * "Atrasado" é o único estado do domínio que NÃO é um fato registrado: o banco nunca
 * grava "isto atrasou às 14h03". É um estado DERIVADO, computado comparando o horário
 * limite da rotina com a hora atual. Não há INSERT nem UPDATE para reagir.
 *
 * Por isso este é o único tipo de notificação que precisa de um cron — todos os outros
 * nascem de uma ação do usuário.
 *
 * Duas decisões que sustentam a corretude:
 *
 * 1. REUSA `getOperationalStatus` — a MESMA função pura que a tela usa. Reimplementar a
 *    regra aqui criaria duas verdades sobre o que é "atrasado", e elas divergiriam na
 *    primeira mudança. O cron não pode discordar do que o gestor vê.
 *
 * 2. O "agora" é calculado NO FUSO DE CADA RESTAURANTE. Há histórico nisso: falsos
 *    "ATRASADO" já foram diagnosticados no projeto como fuso mal configurado, não bug.
 *    Usar o fuso do servidor notificaria a rotina certa na hora errada.
 *
 * Idempotência: a dedup_key é `delayed:<checklist_id>:<date_key>`. O cron roda a cada 15
 * minutos, mas o índice UNIQUE garante NO MÁXIMO UMA notificação por rotina/dia. Sem
 * isso, uma rotina atrasada geraria um alerta a cada varredura — spam garantido.
 *
 * CUSTO — SCAN EM LOTE (s91, F7): o desenho anterior era O(restaurantes) sequencial, com
 * ~5 queries POR restaurante (medido: ~2.5 min no NONPROD). Agora as buscas são
 * BATCHEADAS: shifts e areas de TODOS os restaurantes em 1 query cada; as views agrupadas
 * POR FUSO (uma chamada de fetchChecklistViews por timezone distinto — quase sempre 1).
 * O laço de status roda em memória, sem novas queries. Queries totais caem de O(5N) para
 * ~O(3 + fusos·3). Sobra apenas 1 emissão por rotina atrasada (inerente ao evento).
 *
 * Por que agrupar por FUSO e não jogar tudo numa chamada só: fetchChecklistViews usa o
 * fuso do PRIMEIRO restaurante para o `date_key` das assumptions. Misturar fusos usaria um
 * dia errado para parte deles — reintroduzindo exatamente o bug de fuso que evitamos. Como
 * todos os restaurantes de um grupo compartilham o fuso, o date_key fica correto para todos.
 *
 * Próximo ponto se crescer: cachear `resolveRecipients` por restaurante (hoje 1 query por
 * emissão).
 */

export interface DelayedScanResult {
    restaurants: number;
    checked: number;
    delayed: number;
}

function getAdminSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

interface RestaurantRow {
    id: string;
    timezone: string | null;
    name: string | null;
}

export async function detectDelayedRoutines(
    options: {
        admin?: SupabaseClient;
        /** Restringe a varredura. Sem isto, percorre TODOS os restaurantes ativos. */
        restaurantIds?: string[];
    } = {},
): Promise<DelayedScanResult> {
    const admin = options.admin ?? getAdminSupabase();
    const result: DelayedScanResult = { restaurants: 0, checked: 0, delayed: 0 };

    let query = admin.from("restaurants").select("id, timezone, name").eq("active", true);
    if (options.restaurantIds?.length) {
        query = query.in("id", options.restaurantIds);
    }

    const { data: restaurants, error } = await query;
    if (error) throw new Error(`restaurants: ${error.message}`);

    const rests = (restaurants ?? []) as RestaurantRow[];
    const allIds = rests.map((r) => r.id);

    if (allIds.length > 0) {
        // ── Batch 1: shifts e areas de TODOS os restaurantes (independem de fuso) ──────
        const [shiftsRes, areasRes] = await Promise.all([
            admin.from("shifts").select("*").in("restaurant_id", allIds),
            admin.from("areas").select("id, name, restaurant_id").in("restaurant_id", allIds),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shiftsByRest = new Map<string, any[]>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (shiftsRes.data ?? []) as any[]) {
            const list = shiftsByRest.get(s.restaurant_id) ?? [];
            list.push(s);
            shiftsByRest.set(s.restaurant_id, list);
        }

        const areaNameByRest = new Map<string, Map<string, string>>();
        for (const a of (areasRes.data ?? []) as { id: string; name: string; restaurant_id: string }[]) {
            const m = areaNameByRest.get(a.restaurant_id) ?? new Map<string, string>();
            m.set(a.id, a.name);
            areaNameByRest.set(a.restaurant_id, m);
        }

        // unitsById pronto → evita a query interna de restaurants do fetchChecklistViews.
        const unitsById = Object.fromEntries(
            rests.map((r) => [r.id, { id: r.id, name: r.name ?? "" }]),
        );

        // ── Batch 2: views agrupadas por FUSO (o date_key das assumptions depende do fuso) ─
        const idsByTz = new Map<string, string[]>();
        for (const r of rests) {
            const tz = r.timezone ?? "America/Sao_Paulo";
            const list = idsByTz.get(tz) ?? [];
            list.push(r.id);
            idsByTz.set(tz, list);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const viewsByRest = new Map<string, any[]>();
        for (const [, ids] of idsByTz) {
            const views = await fetchChecklistViews(admin, { restaurantIds: ids, unitsById });
            for (const v of views) {
                const rid = (v as { restaurant_id: string }).restaurant_id;
                const list = viewsByRest.get(rid) ?? [];
                list.push(v);
                viewsByRest.set(rid, list);
            }
        }

        // ── Laço em memória: status por restaurante no SEU fuso, sem novas queries ─────
        for (const r of rests) {
            result.restaurants += 1;

            const tz = r.timezone ?? "America/Sao_Paulo";
            const now = getNowInTz(tz);
            const shifts = shiftsByRest.get(r.id) ?? [];
            const areaNameById = areaNameByRest.get(r.id) ?? new Map<string, string>();
            const views = viewsByRest.get(r.id) ?? [];

            const statusCtx = { dayOfWeek: now.dayOfWeek, dateKey: now.dateKey, shifts };

            for (const view of views) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const checklist = view as any;
                if (!checklist.active) continue;

                result.checked += 1;

                const status = getOperationalStatus(checklist, now.minutes, statusCtx);
                if (status !== "overdue") continue;

                result.delayed += 1;

                await emitDomainEvent(admin, "RoutineDelayed", {
                    restaurantId: r.id,
                    // Ninguém "causou" o atraso — é o tempo passando. Sem ator.
                    actorUserId: null,
                    payload: {
                        checklist_id: checklist.id,
                        checklist_assumption_id: checklist.assumption_id ?? null,
                        date_key: now.dateKey,
                        checklist_name: checklist.name ?? "Rotina",
                        // s92: a rotina pode ter várias áreas — lista todas.
                        area_name: (() => {
                            const ids: string[] = checklist.area_ids?.length
                                ? checklist.area_ids
                                : (checklist.area_id ? [checklist.area_id] : []);
                            const names = ids
                                .map((id: string) => areaNameById.get(id))
                                .filter((n): n is string => Boolean(n));
                            return names.length > 0 ? names.join(", ") : null;
                        })(),
                    },
                });
            }
        }
    }

    notificationLog.info({
        op: "emit",
        action: "RoutineDelayed",
        status: "scan_complete",
        msg: `${result.restaurants} restaurantes, ${result.checked} rotinas, ${result.delayed} atrasadas`,
    });

    return result;
}
