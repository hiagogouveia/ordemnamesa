import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    type DomainEvent,
    type DomainEventType,
    type EmittableNotificationType,
    type IssuePayload,
    type NotificationPayloadMap,
    PAYLOAD_VERSION,
} from "./contract";
import { NOTIFICATION_DESCRIPTORS, assertEmittableType } from "./registry";
import { notificationLog } from "./log";

/**
 * MATERIALIZAÇÃO — evento de domínio → notificações.
 *
 * Este é o ÚNICO lugar do sistema que decide:
 *   - QUEM é notificado (resolveRecipients)
 *   - com que PRIORIDADE e ÍCONE (do registry)
 *   - com que TEXTO (do registry)
 *
 * As rotas de negócio não sabem nada disso — elas só declaram o que aconteceu.
 * Era esta a "lógica espalhada" que o redesenho veio matar.
 */

/** A quem o evento se destina. Nasce role-aware para a evolução futura (staff). */
type Audience =
    | { kind: "managers"; exceptUserId?: string | null }
    | { kind: "user"; userId: string };

interface NotificationDraft<T extends EmittableNotificationType = EmittableNotificationType> {
    type: T;
    payload: NotificationPayloadMap[T];
    audience: Audience;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers — um por evento de domínio. Mapa exaustivo: falta um, o build quebra.
// ─────────────────────────────────────────────────────────────────────────────

type Handlers = {
    [E in DomainEventType]: (event: DomainEvent<E>) => NotificationDraft[];
};

export const EVENT_HANDLERS: Handlers = {
    /**
     * O evento que estava MORTO desde o s45: reportar uma ocorrência não gerava
     * notificação nenhuma. O gestor só descobria abrindo a rotina na mão.
     *
     * Impedimento e ocorrência são a MESMA entidade (task_issues) — o s45 unificou
     * os dois quando removeu o status 'blocked'. O que os separa é a `severity`,
     * e é ela que escolhe o tipo (⇒ ícone, cor e prioridade distintos).
     */
    IssueReported: (event) => {
        const p = event.payload;
        return [
            {
                type: p.severity === "blocker" ? "BLOCKER_REPORTED" : "ISSUE_REPORTED",
                payload: p,
                // Quem reportou não precisa ser avisado do próprio report.
                audience: { kind: "managers", exceptUserId: event.actor_user_id },
            },
        ];
    },

    /** O gestor resolveu: quem reportou merece saber que foi tratado. */
    IssueResolved: (event) => {
        const p: IssuePayload = event.payload;
        if (!p.reported_by_user_id) return [];
        return [
            {
                type: "ISSUE_RESOLVED",
                payload: p,
                audience: { kind: "user", userId: p.reported_by_user_id },
            },
        ];
    },

    RoutineCompletedWithNote: (event) => [
        {
            type: "TASK_COMPLETED_WITH_NOTE",
            payload: event.payload,
            audience: { kind: "managers", exceptUserId: event.actor_user_id },
        },
    ],

    RoutineDelayed: (event) => [
        {
            type: "ROUTINE_DELAYED",
            payload: event.payload,
            audience: { kind: "managers" },
        },
    ],

    ResponsibleTransferred: (event) => [
        {
            type: "RESPONSIBLE_TRANSFERRED",
            payload: event.payload,
            audience: { kind: "managers", exceptUserId: event.actor_user_id },
        },
    ],

    PasswordChangedByAdmin: (event) => [
        {
            type: "PASSWORD_CHANGED_BY_ADMIN",
            payload: {
                changed_by_user_id: event.payload.changed_by_user_id,
                changed_at: event.payload.changed_at,
            },
            audience: { kind: "user", userId: event.payload.target_user_id },
        },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Destinatários
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a audiência em user_ids concretos.
 *
 * Escopo atual (decisão de produto): só owner/manager recebem — a Central é
 * ferramenta de gestão, e `/checklists` hoje bloqueia staff. A função já nasce
 * role-aware para que abrir o sino ao staff seja trocar a audiência, não a arquitetura.
 */
async function resolveRecipients(
    admin: SupabaseClient,
    restaurantId: string,
    audience: Audience,
): Promise<string[]> {
    if (audience.kind === "user") return [audience.userId];

    const { data, error } = await admin
        .from("restaurant_users")
        .select("user_id")
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .in("role", ["owner", "manager"]);

    if (error) throw new Error(`resolveRecipients: ${error.message}`);

    return (data ?? [])
        .map((r: { user_id: string }) => r.user_id)
        .filter((id) => id !== audience.exceptUserId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Materialização
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforma o evento em linhas de `notifications`. Retorna quantas foram criadas.
 *
 * Idempotente por construção: o índice UNIQUE(event_id, user_id) (s90) impede que
 * um reprocessamento do cron entregue duas cópias ao mesmo destinatário. Por isso o
 * insert é um upsert com `ignoreDuplicates` — reprocessar é seguro.
 *
 * LANÇA em caso de falha, de propósito: quem chama registra `last_error` no evento
 * e deixa a linha pendente para o cron. Silenciar aqui seria repetir o bug antigo.
 */
export async function materializeNotifications(
    admin: SupabaseClient,
    event: DomainEvent,
): Promise<number> {
    const handler = EVENT_HANDLERS[event.event_type] as (e: DomainEvent) => NotificationDraft[];
    if (!handler) throw new Error(`evento sem handler: ${event.event_type}`);

    const drafts = handler(event);
    if (drafts.length === 0) return 0;

    const rows: Record<string, unknown>[] = [];

    for (const draft of drafts) {
        // Substitui a garantia que o CHECK de `type` dava no banco (removido no s90).
        assertEmittableType(draft.type);

        const descriptor = NOTIFICATION_DESCRIPTORS[draft.type];
        const recipients = await resolveRecipients(admin, event.restaurant_id, draft.audience);
        if (recipients.length === 0) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { title, description } = descriptor.render(draft.payload as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupKey = descriptor.groupKey(draft.payload as any);

        for (const userId of recipients) {
            rows.push({
                restaurant_id: event.restaurant_id,
                user_id: userId,
                event_id: event.id,
                type: draft.type,
                title,
                description,
                priority: descriptor.priority,
                group_key: groupKey,
                payload: draft.payload,
                payload_version: PAYLOAD_VERSION,

                // Dual-write das colunas legadas durante a transição: se o frontend
                // for revertido, o dropdown antigo continua conseguindo navegar.
                metadata: draft.payload,
                related_id: relatedIdOf(draft.payload),
            });
        }
    }

    if (rows.length === 0) return 0;

    const { error } = await admin
        .from("notifications")
        .upsert(rows, { onConflict: "event_id,user_id", ignoreDuplicates: true });

    if (error) throw new Error(`insert notifications: ${error.message}`);

    return rows.length;
}

/** Compat: o dropdown pré-s90 navega por `related_id` (sempre um checklist_id). */
function relatedIdOf(payload: unknown): string | null {
    if (typeof payload === "object" && payload !== null && "checklist_id" in payload) {
        const v = (payload as { checklist_id: unknown }).checklist_id;
        return typeof v === "string" ? v : null;
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTLE — o invólucro ÚNICO: materializa o evento e resolve seu status.
//
// Antes, este invólucro (materialize + atualizar status + log) estava DUPLICADO em dois
// lugares: `emit.ts` (fast-path inline) e `process.ts` (cron de retry). Os dois já
// chamavam `materializeNotifications`, mas cada um reimplementava o settle — e podiam
// divergir. Agora há UMA implementação, chamada pelos DOIS gatilhos.
//
// A contabilidade de tentativas fica consistente: cada chamada é uma tentativa. O evento
// carrega `attempts`/`max_attempts` do banco; sucesso marca `processed`, falha aplica
// backoff e, esgotadas as tentativas, marca `failed` (que a retenção preserva — é
// evidência de bug).
// ─────────────────────────────────────────────────────────────────────────────

/** Evento como vem do banco: o DomainEvent + os campos de controle de retry. */
export type StoredDomainEvent = DomainEvent & {
    attempts: number;
    max_attempts: number;
};

export type SettleOutcome = "processed" | "retry_scheduled" | "exhausted";

/** Backoff exponencial: 1min, 2, 4, 8, 16… teto 60. Não martela um banco em apuros. */
export function nextAttemptAt(attempts: number): string {
    const minutes = Math.min(2 ** attempts, 60);
    return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * Materializa UM evento e resolve seu status no `domain_events`. NUNCA lança — o desfecho
 * volta no retorno, para que nem o fast-path nem o cron sejam derrubados por um evento.
 */
export async function settleDomainEvent(
    admin: SupabaseClient,
    event: StoredDomainEvent,
): Promise<{ outcome: SettleOutcome; count: number }> {
    const attempts = (event.attempts ?? 0) + 1;

    try {
        const count = await materializeNotifications(admin, event);

        await admin
            .from("domain_events")
            .update({
                status: "processed",
                attempts,
                processed_at: new Date().toISOString(),
                last_error: null,
            })
            .eq("id", event.id);

        notificationLog.info({
            op: "materialize",
            action: event.event_type,
            restaurant_id: event.restaurant_id,
            status: "processed",
            msg: `${event.id} → ${count} notificação(ões) (tentativa ${attempts})`,
        });

        return { outcome: "processed", count };
    } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        // Esgotou as tentativas: para de tentar, mas a linha PERMANECE como evidência do
        // bug (a retenção não apaga `failed`).
        const exhausted = attempts >= (event.max_attempts ?? 5);

        await admin
            .from("domain_events")
            .update({
                status: exhausted ? "failed" : "pending",
                attempts,
                next_attempt_at: nextAttemptAt(attempts),
                last_error: message,
            })
            .eq("id", event.id);

        notificationLog.error({
            op: "materialize",
            action: event.event_type,
            restaurant_id: event.restaurant_id,
            status: exhausted ? "exhausted" : "retry_scheduled",
            msg: `${event.id} (tentativa ${attempts}/${event.max_attempts ?? 5}): ${message}`,
        });

        return { outcome: exhausted ? "exhausted" : "retry_scheduled", count: 0 };
    }
}
