"use client";

import type { ChecklistLoadErrorCode } from "@/lib/hooks/use-checklist-by-id";

/**
 * O estado elegante quando o deep-link NÃO consegue chegar ao contexto.
 *
 * Requisito: "Nunca erro. Nunca tela branca. Nunca exception." — e, mesmo quando a
 * rotina não existe mais, ainda mostrar as informações básicas da notificação.
 *
 * Antes, os três casos abaixo davam exatamente o MESMO resultado: nada. O painel não
 * abria, nenhuma mensagem aparecia, e o param era apagado da URL. O gestor ficava
 * olhando uma lista, sem saber por que o clique não fez nada.
 *
 * A notificação NÃO é marcada como lida em nenhum destes casos (o handshake chama
 * `fail`) — o assunto não foi tratado, então continua pendente.
 */

type FallbackKind = ChecklistLoadErrorCode | "TENANT_DENIED" | "LOADING";

const COPY: Record<
    Exclude<FallbackKind, "LOADING">,
    { icon: string; title: string; body: string; tone: string }
> = {
    CHECKLIST_NOT_FOUND: {
        icon: "delete_history",
        title: "Esta rotina não existe mais.",
        body: "Ela foi excluída depois que a notificação foi criada. As informações abaixo são o que ficou registrado.",
        tone: "text-[#92bbc9]",
    },
    NO_ACCESS: {
        icon: "lock",
        title: "Você não tem acesso a esta rotina.",
        body: "Ela pertence a uma unidade da qual você não faz parte.",
        tone: "text-amber-300",
    },
    TENANT_DENIED: {
        icon: "lock",
        title: "Você não tem acesso a esta unidade.",
        body: "Peça a um gestor para incluir você nesta unidade.",
        tone: "text-amber-300",
    },
    UNKNOWN: {
        icon: "error",
        title: "Não foi possível abrir esta rotina.",
        body: "Tente novamente em alguns instantes.",
        tone: "text-amber-300",
    },
};

interface DeepLinkFallbackProps {
    kind: FallbackKind;
    onClose: () => void;
    /** O que sobrou da notificação — mostrado mesmo quando a rotina sumiu. */
    notification?: { title: string; description: string | null; created_at: string } | null;
}

export function DeepLinkFallback({ kind, onClose, notification }: DeepLinkFallbackProps) {
    if (kind === "LOADING") {
        return (
            <div className="flex flex-col h-full bg-[#101d22] p-4 gap-3" aria-busy="true">
                <div className="h-6 w-2/3 rounded bg-[#1a2c32] animate-pulse" />
                <div className="h-4 w-1/3 rounded bg-[#1a2c32] animate-pulse" />
                <div className="h-24 w-full rounded-xl bg-[#1a2c32] animate-pulse mt-2" />
                <span className="sr-only">Carregando rotina…</span>
            </div>
        );
    }

    const copy = COPY[kind];

    return (
        <div className="flex flex-col h-full bg-[#101d22]" role="alert">
            <div className="flex items-center justify-between p-4 border-b border-[#1a2c32]">
                <h2 className="text-white font-bold text-sm">Notificação</h2>
                <button
                    onClick={onClose}
                    aria-label="Fechar"
                    className="text-[#92bbc9] hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center gap-3">
                <span className={`material-symbols-outlined text-4xl ${copy.tone}`} aria-hidden="true">
                    {copy.icon}
                </span>
                <p className="text-white font-semibold text-base">{copy.title}</p>
                <p className="text-[#92bbc9] text-sm leading-relaxed max-w-xs">{copy.body}</p>

                {/* A notificação continua legível mesmo sem o destino — nunca uma tela vazia. */}
                {notification && (
                    <div className="mt-4 w-full text-left bg-[#0c1518] border border-[#233f48] rounded-xl p-4">
                        <p className="text-white text-sm font-semibold">{notification.title}</p>
                        {notification.description && (
                            <p className="text-[#92bbc9] text-xs mt-1 leading-relaxed">
                                {notification.description}
                            </p>
                        )}
                        <time
                            dateTime={notification.created_at}
                            className="text-[#325a67] text-[11px] mt-2 block"
                        >
                            {new Date(notification.created_at).toLocaleString("pt-BR")}
                        </time>
                    </div>
                )}
            </div>
        </div>
    );
}
