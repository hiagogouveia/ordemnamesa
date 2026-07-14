/**
 * RESOLUÇÃO DE NAVEGAÇÃO — de uma notificação para o contexto exato que a originou.
 *
 * Princípio: o contrato NÃO SABE O QUE É UMA URL.
 *
 * `NavigationTarget` é uma INTENÇÃO DE DOMÍNIO ("o painel da rotina X, aba
 * Ocorrências, focado na ocorrência Y"), não uma string de rota. Quem traduz
 * intenção em ação é o executor (`useNotificationNavigator`), e a tradução para
 * URL vive em `targetToHref()`, aqui embaixo.
 *
 * Por que isso importa: se amanhã o painel virar um drawer ou um modal, muda-se
 * o EXECUTOR — e mais nada. Payload, contrato, emissores e estes resolvers ficam
 * intactos. Um `kind` novo (`'modal'`, `'drawer'`) é uma extensão da união aqui,
 * sem tocar em nenhuma notificação já emitida nem em nenhum emissor.
 *
 * Isomórfico (sem `next/navigation`): dá para testar cada destino como função pura.
 */

import {
    type AnyNotification,
    type NotificationOf,
    type NotificationType,
    isUnknown,
} from "./contract";

// ─────────────────────────────────────────────────────────────────────────────
// A intenção
// ─────────────────────────────────────────────────────────────────────────────

/** Abas do painel de rotina. */
export type ChecklistPanelTab = "tasks" | "issues" | "history";

/**
 * O painel de uma rotina, num dia específico, opcionalmente focado num item.
 * Tudo por ID — nunca por nome, nunca por busca textual.
 */
export interface ChecklistPanelTarget {
    kind: "checklist-panel";
    restaurantId: string;
    checklistId: string;
    /** Escopo temporal. Sem ele o painel só sabe falar do "hoje" (bug pré-s90). */
    dateKey: string;
    tab: ChecklistPanelTab;
    /** Quando conhecido, evita uma query de resolução no destino. */
    assumptionId?: string;
    /** Item a focar: scroll + destaque. */
    issueId?: string;
    taskId?: string;
}

/** Rota simples, sem estado de painel. */
export interface RouteTarget {
    kind: "route";
    path: string;
}

/** Notificação puramente informativa — não há para onde ir. */
export interface NoneTarget {
    kind: "none";
    reason: "informational" | "legacy_without_payload";
}

export type NavigationTarget = ChecklistPanelTarget | RouteTarget | NoneTarget;

// ─────────────────────────────────────────────────────────────────────────────
// Os resolvers — um por tipo. O mapa é exaustivo: falta um, o build quebra.
// ─────────────────────────────────────────────────────────────────────────────

type Resolvers = {
    [T in NotificationType]: (n: NotificationOf<T>) => NavigationTarget;
};

/** Ocorrência, impedimento e resolução caem todos na aba Ocorrências, focados no item. */
function issueTarget(n: NotificationOf<"ISSUE_REPORTED" | "BLOCKER_REPORTED" | "ISSUE_RESOLVED">): NavigationTarget {
    const p = n.payload;
    return {
        kind: "checklist-panel",
        restaurantId: n.restaurant_id,
        checklistId: p.checklist_id,
        dateKey: p.date_key,
        tab: "issues",
        assumptionId: p.checklist_assumption_id ?? undefined,
        issueId: p.issue_id,
    };
}

export const NAVIGATION_RESOLVERS: Resolvers = {
    ISSUE_REPORTED: issueTarget,
    BLOCKER_REPORTED: issueTarget,
    ISSUE_RESOLVED: issueTarget,

    TASK_COMPLETED_WITH_NOTE: (n) => ({
        kind: "checklist-panel",
        restaurantId: n.restaurant_id,
        checklistId: n.payload.checklist_id,
        dateKey: n.payload.date_key,
        // A observação vive no bloco de execução do dia, que a aba Tarefas mostra.
        tab: "tasks",
        assumptionId: n.payload.checklist_assumption_id ?? undefined,
    }),

    ROUTINE_DELAYED: (n) => ({
        kind: "checklist-panel",
        restaurantId: n.restaurant_id,
        checklistId: n.payload.checklist_id,
        dateKey: n.payload.date_key,
        tab: "tasks",
        assumptionId: n.payload.checklist_assumption_id ?? undefined,
    }),

    RESPONSIBLE_TRANSFERRED: (n) => ({
        kind: "checklist-panel",
        restaurantId: n.restaurant_id,
        checklistId: n.payload.checklist_id,
        dateKey: n.payload.date_key,
        tab: "tasks",
    }),

    // Informativa: não existe "o evento" para abrir. Antes do s90 o clique
    // simplesmente não fazia nada (sem related_id) — agora isso é explícito.
    PASSWORD_CHANGED_BY_ADMIN: () => ({ kind: "none", reason: "informational" }),

    // ── Deprecados: sem produtor, mas podem existir linhas. Degradam com elegância.
    NEW_TASK_ASSIGNED: (n) => legacyRelatedIdTarget(n.payload.related_id, n.restaurant_id),
    NEW_TASK_FOR_AREA: (n) => legacyRelatedIdTarget(n.payload.related_id, n.restaurant_id),
};

/**
 * Linhas legadas guardavam só um `related_id` solto (que, na prática, sempre foi
 * um checklist_id). Sem `date_key` não dá para escolher um dia — abrimos a rotina
 * sem escopo temporal e deixamos o destino resolver para o dia corrente.
 */
function legacyRelatedIdTarget(relatedId: string | null, restaurantId: string): NavigationTarget {
    if (!relatedId) return { kind: "none", reason: "legacy_without_payload" };
    return {
        kind: "checklist-panel",
        restaurantId,
        checklistId: relatedId,
        dateKey: "", // vazio ⇒ o destino usa o dia corrente do restaurante
        tab: "tasks",
    };
}

/**
 * Resolve o destino de qualquer notificação — inclusive as desconhecidas.
 * NUNCA lança. Tipo fora do contrato ⇒ `none`, e a UI a torna não-clicável.
 */
export function resolveNavigationTarget(n: AnyNotification): NavigationTarget {
    if (isUnknown(n)) return { kind: "none", reason: "legacy_without_payload" };
    // O cast é seguro: a união garante que payload e type andam juntos, mas o TS
    // não estreita os dois lados de um lookup dinâmico em mapa.
    const resolve = NAVIGATION_RESOLVERS[n.type] as (x: AnyNotification) => NavigationTarget;
    return resolve(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tradução intenção → URL.
//
// ISOLADA DE PROPÓSITO. É o ÚNICO ponto que conhece a forma da rota. Trocar o
// painel por um drawer amanhã reescreve esta função — e nada mais.
// ─────────────────────────────────────────────────────────────────────────────

/** Param que carrega a notificação até o destino, para o handshake de leitura. */
export const NOTIFICATION_ACK_PARAM = "nkey";

export function targetToHref(target: NavigationTarget, notificationId?: string): string | null {
    if (target.kind === "none") return null;
    if (target.kind === "route") return target.path;

    const params = new URLSearchParams();

    // `restaurant_id` na URL resolve o problema estrutural do tenant em
    // sessionStorage: um link aberto em aba nova perdia o contexto e o deep-link
    // morria em silêncio. Aqui a URL é um PEDIDO — o destino valida a pertinência
    // contra /api/my-restaurants antes de trocar de tenant.
    params.set("restaurant_id", target.restaurantId);
    params.set("openId", target.checklistId);
    params.set("view", "board"); // requisito: sempre abrir em modo Cards
    params.set("tab", target.tab);
    if (target.dateKey) params.set("date_key", target.dateKey);
    if (target.assumptionId) params.set("assumption_id", target.assumptionId);
    if (target.issueId) params.set("issue", target.issueId);
    if (target.taskId) params.set("task_id", target.taskId);
    if (notificationId) params.set(NOTIFICATION_ACK_PARAM, notificationId);

    return `/checklists?${params.toString()}`;
}
