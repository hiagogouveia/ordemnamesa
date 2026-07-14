"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AnyNotification } from "./contract";
import {
    NOTIFICATION_ACK_PARAM,
    resolveNavigationTarget,
    targetToHref,
} from "./navigation";

/**
 * NOTIFICATION NAVIGATOR — o executor único da navegação por notificação.
 *
 * O contrato produz uma INTENÇÃO de domínio ("o painel da rotina X, aba Ocorrências,
 * focado na ocorrência Y"). Este módulo é o ÚNICO lugar que sabe transformá-la em
 * ação. Nada mais no app chama `router.push` a partir de uma notificação.
 *
 * Por que centralizar em vez de espalhar `router.push`:
 *   - Trocar o painel por um drawer/modal amanhã reescreve ESTE arquivo, e mais nada.
 *     Payload, contrato, emissores e resolvers ficam intactos.
 *   - Concentra as quatro responsabilidades hoje espalhadas ou ausentes: resolver a
 *     intenção, executá-la, AGUARDAR A CONFIRMAÇÃO do destino, e só então marcar como
 *     lida + emitir telemetria.
 *
 * ── O handshake de leitura, sem timeout ──────────────────────────────────────
 *
 * Requisito: "marcar como lida somente após abrir corretamente o destino; se a
 * navegação falhar, não marcar" — e "não usar timeout para sincronizar navegação".
 *
 * A solução é CAUSAL, não temporal:
 *   1. O clique NÃO marca como lida. Só navega, levando `?nkey=<id>` na URL.
 *   2. A PÁGINA DE DESTINO é quem sabe se deu certo. Quando termina de reconstruir o
 *      contexto (rotina carregada, aba certa, item encontrado), chama `ack()`.
 *      Se não conseguir (rotina excluída, sem acesso), chama `fail()`.
 *   3. Só no `ack()` a notificação é marcada como lida.
 *
 * Nenhum timer decide nada. Quem confirma é o estado real do destino.
 */

export type NavigationFailureReason =
    | "not_found"
    | "no_access"
    | "issue_not_found"
    | "tenant_denied";

export interface NavigationTelemetry {
    name:
        | "notification_clicked"
        | "notification_navigation_succeeded"
        | "notification_navigation_failed";
    notificationId: string;
    eventId: string | null;
    type: string;
    reason?: NavigationFailureReason;
}

interface NavigatorContextValue {
    navigate: (notification: AnyNotification) => { navigated: boolean };
    /** Chamado pela página de destino quando o contexto foi reconstruído com sucesso. */
    ack: (notificationId: string) => void;
    /** Chamado pela página de destino quando não foi possível chegar ao contexto. */
    fail: (notificationId: string, reason: NavigationFailureReason) => void;
}

const NavigatorContext = createContext<NavigatorContextValue | null>(null);

/** Fora do provider tudo vira no-op — nunca lança, nunca quebra uma tela. */
const NOOP: NavigatorContextValue = {
    navigate: () => ({ navigated: false }),
    ack: () => {},
    fail: () => {},
};

interface ProviderProps {
    children: React.ReactNode;
    /** Marca como lida. Só é chamado no `ack` — nunca no clique. */
    onMarkRead: (notificationId: string) => void;
    onTelemetry?: (event: NavigationTelemetry) => void;
}

export function NotificationNavigatorProvider({
    children,
    onMarkRead,
    onTelemetry,
}: ProviderProps) {
    const router = useRouter();

    // Notificações cujo desfecho já foi processado. Torna o handshake IDEMPOTENTE: a
    // página de destino re-renderiza várias vezes, e um duplo-clique não pode marcar
    // duas vezes nem disparar telemetria duplicada.
    const settled = useRef<Set<string>>(new Set());
    // Contexto do clique, para correlacionar o desfecho com a origem (event_id).
    const inFlight = useRef<Map<string, { eventId: string | null; type: string }>>(new Map());

    const navigate = useCallback(
        (notification: AnyNotification) => {
            const href = targetToHref(
                resolveNavigationTarget(notification),
                notification.id,
            );

            // Informativa (ex.: senha alterada) ou payload irrecuperável: não há para
            // onde ir. Não é erro — é a ausência explícita de destino.
            if (!href) return { navigated: false };

            // Um segundo clique na mesma notificação é inofensivo: mesma URL, e o
            // desfecho já está guardado em `settled`.
            inFlight.current.set(notification.id, {
                eventId: notification.event_id,
                type: notification.type,
            });

            onTelemetry?.({
                name: "notification_clicked",
                notificationId: notification.id,
                eventId: notification.event_id,
                type: notification.type,
            });

            // A leitura NÃO é marcada aqui. Quem confirma é o destino, via ack().
            router.push(href);
            return { navigated: true };
        },
        [router, onTelemetry],
    );

    const ack = useCallback(
        (notificationId: string) => {
            if (settled.current.has(notificationId)) return;
            settled.current.add(notificationId);

            const ctx = inFlight.current.get(notificationId);
            inFlight.current.delete(notificationId);

            onMarkRead(notificationId);
            onTelemetry?.({
                name: "notification_navigation_succeeded",
                notificationId,
                eventId: ctx?.eventId ?? null,
                type: ctx?.type ?? "unknown",
            });
        },
        [onMarkRead, onTelemetry],
    );

    const fail = useCallback(
        (notificationId: string, reason: NavigationFailureReason) => {
            if (settled.current.has(notificationId)) return;
            settled.current.add(notificationId);

            const ctx = inFlight.current.get(notificationId);
            inFlight.current.delete(notificationId);

            // NÃO marca como lida — e isso é deliberado. O gestor não chegou ao
            // contexto, logo o assunto não foi tratado: a notificação continua pendente.
            onTelemetry?.({
                name: "notification_navigation_failed",
                notificationId,
                eventId: ctx?.eventId ?? null,
                type: ctx?.type ?? "unknown",
                reason,
            });
        },
        [onTelemetry],
    );

    const value = useMemo(() => ({ navigate, ack, fail }), [navigate, ack, fail]);

    return <NavigatorContext.Provider value={value}>{children}</NavigatorContext.Provider>;
}

export function useNotificationNavigator(): NavigatorContextValue {
    return useContext(NavigatorContext) ?? NOOP;
}

export { NOTIFICATION_ACK_PARAM };
