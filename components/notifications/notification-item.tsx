"use client";

import { forwardRef } from "react";
import type { AnyNotification } from "@/lib/notifications/contract";
import { resolveNavigationTarget, targetToHref } from "@/lib/notifications/navigation";
import { colorFor, iconFor } from "@/lib/notifications/registry";

/** "agora" / "há 12 min" / "há 3h" / "há 2d" — com teto, para não virar "há 400d". */
export function formatTimeAgo(dateStr: string): string {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return "agora";
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 86400 * 30) return `há ${Math.floor(diff / 86400)}d`;
    return new Date(dateStr).toLocaleDateString("pt-BR");
}

/** Data absoluta para o `title`/tooltip — o relativo sozinho perde precisão. */
function absoluteTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    });
}

interface NotificationItemProps {
    notification: AnyNotification;
    onClick: (n: AnyNotification) => void;
    /** Itens dentro de um grupo expandido ganham recuo. */
    nested?: boolean;
}

/**
 * Um item da Central.
 *
 * Ícone, cor e prioridade vêm do REGISTRY (indexado por NotificationType) — antes eram
 * dois `Record<string, string>` soltos no componente, e como a chave era `string` o
 * TypeScript não cobrava nada: um tipo sem entrada caía no ícone genérico em silêncio.
 *
 * Sem destino resolvível (informativa, ou payload corrompido) ⇒ o card fica
 * explicitamente não-clicável, em vez de fingir que é um botão que não faz nada.
 */
export const NotificationItem = forwardRef<HTMLButtonElement, NotificationItemProps>(
    function NotificationItem({ notification, onClick, nested = false }, ref) {
        const href = targetToHref(resolveNavigationTarget(notification), notification.id);
        const clickable = !!href;
        const icon = iconFor(notification.type);
        const color = colorFor(notification.type);
        const isCritical = notification.priority === "critical";

        return (
            <button
                ref={ref}
                role="menuitem"
                type="button"
                onClick={() => onClick(notification)}
                disabled={!clickable}
                aria-disabled={!clickable}
                aria-label={`${notification.title}. ${notification.read ? "Lida" : "Não lida"}. ${formatTimeAgo(notification.created_at)}.`}
                className={`w-full text-left py-3 flex gap-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec] focus-visible:ring-inset ${
                    nested ? "pl-12 pr-4" : "px-4"
                } ${clickable ? "hover:bg-[#16262c] cursor-pointer" : "cursor-default"} ${
                    !notification.read ? "bg-[#13b6ec]/5" : ""
                }`}
            >
                <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 relative"
                    style={{ backgroundColor: `${color}1a` }}
                >
                    <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ color }}
                        aria-hidden="true"
                    >
                        {icon}
                    </span>
                    {/* Prioridade crítica (impedimento) ganha um anel — a cor sozinha não
                        é acessível para quem não distingue matizes. */}
                    {isCritical && (
                        <span
                            className="absolute inset-0 rounded-full ring-2 ring-red-500/60"
                            aria-hidden="true"
                        />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p
                            className={`text-sm leading-tight line-clamp-1 ${
                                !notification.read ? "text-white font-semibold" : "text-[#92bbc9]"
                            }`}
                        >
                            {notification.title}
                        </p>
                        {!notification.read && (
                            <span
                                className="w-2 h-2 rounded-full bg-[#13b6ec] shrink-0 mt-1.5"
                                aria-hidden="true"
                            />
                        )}
                    </div>

                    {notification.description && (
                        <p className="text-[#92bbc9] text-xs mt-0.5 line-clamp-2 leading-relaxed">
                            {notification.description}
                        </p>
                    )}

                    <time
                        dateTime={notification.created_at}
                        title={absoluteTime(notification.created_at)}
                        className="text-[#325a67] text-[11px] mt-1 block"
                    >
                        {formatTimeAgo(notification.created_at)}
                    </time>
                </div>
            </button>
        );
    },
);
