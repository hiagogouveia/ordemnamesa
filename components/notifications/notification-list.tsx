"use client";

import { useState } from "react";
import type { AnyNotification } from "@/lib/notifications/contract";
import { groupNotifications, type NotificationGroup } from "@/lib/notifications/group";
import { colorFor, iconFor } from "@/lib/notifications/registry";
import { NotificationItem, formatTimeAgo } from "./notification-item";

interface NotificationListProps {
    notifications: AnyNotification[];
    onSelect: (n: AnyNotification) => void;
    emptyLabel?: string;
}

/**
 * A lista da Central: ordenada por prioridade e agrupada.
 *
 * O agrupamento evita a poluição de "20 ocorrências da mesma rotina" — mas NÃO esconde
 * informação: expandir mostra todas, e clicar no grupo leva ao contêiner exato (a rotina,
 * na aba Ocorrências), não a uma tela genérica.
 *
 * A chave de agrupamento (`group_key`) é computada no EMIT e persistida. O cliente só
 * agrupa por IGUALDADE de chave — ele nunca infere semelhança por texto.
 */
export function NotificationList({
    notifications,
    onSelect,
    emptyLabel = "Nenhuma notificação",
}: NotificationListProps) {
    const entries = groupNotifications(notifications);

    if (notifications.length === 0) {
        return (
            <div className="py-12 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-[#325a67] text-4xl" aria-hidden="true">
                    notifications_off
                </span>
                <p className="text-[#92bbc9] text-sm">{emptyLabel}</p>
            </div>
        );
    }

    return (
        <>
            {entries.map((entry) =>
                entry.kind === "single" ? (
                    <NotificationItem
                        key={entry.item.id}
                        notification={entry.item}
                        onClick={onSelect}
                    />
                ) : (
                    <GroupRow key={entry.key} group={entry} onSelect={onSelect} />
                ),
            )}
        </>
    );
}

function GroupRow({
    group,
    onSelect,
}: {
    group: NotificationGroup;
    onSelect: (n: AnyNotification) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    // O representante define ícone/cor e o destino do clique no grupo — é o membro mais
    // bem ranqueado (a lista já vem na ordem canônica), então um impedimento crítico
    // manda no grupo, e não um irmão de prioridade normal.
    const head = group.items[0];
    const icon = iconFor(head.type);
    const color = colorFor(head.type);
    const label = groupLabel(group);

    return (
        <div className="border-b border-[#233f48]/50 last:border-b-0">
            <div className="flex items-stretch">
                {/* Clicar no grupo → o CONTÊINER do evento (a rotina, aba Ocorrências).
                    Continua sendo um contexto exato — só que o do conjunto. */}
                <button
                    type="button"
                    role="menuitem"
                    onClick={() => onSelect(head)}
                    className={`flex-1 text-left px-4 py-3 flex gap-3 transition-colors hover:bg-[#16262c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] focus-visible:ring-inset ${
                        group.unreadCount > 0 ? "bg-[#13b6ec]/5" : ""
                    }`}
                >
                    <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${color}1a` }}
                    >
                        <span
                            className="material-symbols-outlined text-[18px]"
                            style={{ color }}
                            aria-hidden="true"
                        >
                            {icon}
                        </span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <p
                                className={`text-sm leading-tight line-clamp-1 ${
                                    group.unreadCount > 0
                                        ? "text-white font-semibold"
                                        : "text-[#92bbc9]"
                                }`}
                            >
                                {label}
                            </p>
                            {group.unreadCount > 0 && (
                                <span
                                    className="w-2 h-2 rounded-full bg-[#13b6ec] shrink-0 mt-1.5"
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                        <p className="text-[#92bbc9] text-xs mt-0.5 line-clamp-1">
                            {head.description ?? head.title}
                        </p>
                        <time
                            dateTime={head.created_at}
                            className="text-[#325a67] text-[11px] mt-1 block"
                        >
                            {formatTimeAgo(head.created_at)}
                        </time>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    aria-label={
                        expanded
                            ? `Recolher ${group.count} notificações`
                            : `Expandir ${group.count} notificações`
                    }
                    className="px-3 text-[#92bbc9] hover:text-white hover:bg-[#16262c] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] focus-visible:ring-inset"
                >
                    <span
                        className={`material-symbols-outlined text-[20px] transition-transform ${
                            expanded ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                    >
                        expand_more
                    </span>
                </button>
            </div>

            {/* Expandir NUNCA esconde informação: mostra todas as do grupo. */}
            {expanded && (
                <div className="bg-[#0c1518]/60">
                    {group.items.map((n) => (
                        <NotificationItem key={n.id} notification={n} onClick={onSelect} nested />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * "20 novas ocorrências em Abertura Cozinha" — o contexto vem do PAYLOAD, não do texto.
 *
 * O rótulo precisa ser honesto sobre a COMPOSIÇÃO do grupo. Ocorrências comuns e
 * impedimentos compartilham a mesma `group_key` (mesma rotina, mesmo dia), e o "cabeça"
 * do grupo é o membro mais prioritário — normalmente o impedimento. Derivar o rótulo só
 * dele produziria "5 impedimentos" para um grupo com 1 impedimento e 4 ocorrências.
 */
function groupLabel(group: NotificationGroup): string {
    const head = group.items[0];
    const n = group.count;

    const contexto =
        head.type !== "__unknown__" &&
        typeof head.payload === "object" &&
        head.payload !== null &&
        "checklist_name" in head.payload &&
        typeof head.payload.checklist_name === "string" &&
        head.payload.checklist_name
            ? ` em ${head.payload.checklist_name}`
            : "";

    // Grupos de ocorrência podem misturar impedimentos e ocorrências comuns.
    const blockers = group.items.filter((i) => i.type === "BLOCKER_REPORTED").length;
    const issues = group.items.filter(
        (i) => i.type === "ISSUE_REPORTED" || i.type === "BLOCKER_REPORTED",
    ).length;

    if (issues === n && n > 0) {
        if (blockers === n) {
            return `${n} ${n === 1 ? "impedimento" : "impedimentos"}${contexto}`;
        }
        if (blockers > 0) {
            const plural = blockers === 1 ? "impedimento" : "impedimentos";
            return `${n} ocorrências${contexto} · ${blockers} ${plural}`;
        }
        return `${n} novas ocorrências${contexto}`;
    }

    switch (head.type) {
        case "ISSUE_RESOLVED":
            return `${n} ocorrências resolvidas${contexto}`;
        case "TASK_COMPLETED_WITH_NOTE":
            return `${n} observações${contexto}`;
        case "ROUTINE_DELAYED":
            return `${n} rotinas atrasadas`;
        default:
            return `${n} notificações`;
    }
}
