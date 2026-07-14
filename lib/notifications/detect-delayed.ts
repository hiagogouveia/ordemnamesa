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
 * CUSTO (medido): a varredura é O(restaurantes) e sequencial — 3 queries por restaurante
 * mais uma emissão por rotina atrasada. No NONPROD (com dados reais) levou ~1 minuto.
 * Isso é aceitável para um cron de 15 minutos e não vale otimizar agora. Se a contagem
 * de tenants crescer muito, os pontos a atacar são, nesta ordem: (1) cachear os
 * destinatários por restaurante — hoje `resolveRecipients` roda uma query por notificação
 * emitida; (2) paralelizar o laço por restaurante em lotes.
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

    let query = admin.from("restaurants").select("id, timezone").eq("active", true);
    if (options.restaurantIds?.length) {
        query = query.in("id", options.restaurantIds);
    }

    const { data: restaurants, error } = await query;

    if (error) throw new Error(`restaurants: ${error.message}`);

    for (const r of (restaurants ?? []) as RestaurantRow[]) {
        result.restaurants += 1;

        const tz = r.timezone ?? "America/Sao_Paulo";
        const now = getNowInTz(tz);

        const [views, shiftsRes, areasRes] = await Promise.all([
            fetchChecklistViews(admin, { restaurantIds: [r.id] }),
            admin.from("shifts").select("*").eq("restaurant_id", r.id),
            admin.from("areas").select("id, name").eq("restaurant_id", r.id),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shifts = (shiftsRes.data ?? []) as any[];
        const areaNameById = new Map(
            ((areasRes.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
        );

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
                    area_name: checklist.area_id
                        ? (areaNameById.get(checklist.area_id) ?? null)
                        : null,
                },
            });
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
