"use client";

import { useEffect, useState } from "react";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { useAccountUnits } from "@/lib/hooks/use-account-units";
import {
    useTelegramStatus,
    useConnectTelegram,
    useDisconnectTelegram,
    useTestTelegram,
    type TelegramConnectResult,
} from "@/lib/hooks/use-telegram";
import { AsyncButton } from "@/components/ui/async-button";
import { Modal } from "@/components/ui/modal";

const BOT_USERNAME = "ordem_na_mesa_alertas_bot";

export function NotificacoesTab() {
    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const isGlobal = useAccountSessionStore((s) => s.mode) === "global";
    const accountId = useAccountSessionStore((s) => s.accountId);

    // Em modo global o restaurant-store pode estar vazio: usa a 1ª unidade só
    // para a checagem de papel owner/manager no backend (o canal é global mesmo).
    const { data: accountUnits = [] } = useAccountUnits(isGlobal ? accountId : undefined);
    const effectiveRestaurantId = restaurantId ?? (isGlobal ? accountUnits[0]?.id ?? null : null);

    const [modalOpen, setModalOpen] = useState(false);
    const [linkData, setLinkData] = useState<TelegramConnectResult | null>(null);
    const [copied, setCopied] = useState(false);
    const [testFeedback, setTestFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const { data: status, isLoading } = useTelegramStatus(effectiveRestaurantId, modalOpen);
    const connect = useConnectTelegram(effectiveRestaurantId);
    const disconnect = useDisconnectTelegram(effectiveRestaurantId);
    const test = useTestTelegram(effectiveRestaurantId);

    const connected = status?.connected === true;

    // Fecha o modal automaticamente quando o vínculo é detectado pelo poll.
    useEffect(() => {
        if (modalOpen && connected) {
            const t = setTimeout(() => {
                setModalOpen(false);
                setLinkData(null);
            }, 1500);
            return () => clearTimeout(t);
        }
    }, [modalOpen, connected]);

    const handleConnect = async () => {
        setActionError(null);
        try {
            const data = await connect.mutateAsync();
            setLinkData(data);
            setModalOpen(true);
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Falha ao gerar código.");
        }
    };

    const handleDisconnect = async () => {
        setActionError(null);
        setTestFeedback(null);
        if (!window.confirm("Desconectar o Telegram? Você deixará de receber alertas por lá.")) return;
        try {
            await disconnect.mutateAsync();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Falha ao desconectar.");
        }
    };

    const handleTest = async () => {
        setTestFeedback(null);
        try {
            await test.mutateAsync();
            setTestFeedback({ ok: true, msg: "Mensagem de teste enviada! Confira seu Telegram." });
        } catch (e) {
            setTestFeedback({ ok: false, msg: e instanceof Error ? e.message : "Falha ao enviar." });
        }
    };

    const handleCopy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard indisponível — usuário copia manualmente */
        }
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-[#13b6ec] text-[22px]">notifications_active</span>
                    <h2 className="text-lg font-bold text-white">Telegram</h2>
                </div>
                <p className="text-sm text-[#92bbc9] mb-6">
                    Conecte seu Telegram para receber alertas operacionais do Ordem na Mesa diretamente no seu celular.
                </p>

                <div className="rounded-xl border border-[#233f48] bg-[#16262c] p-5">
                    {/* Status */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                            <div
                                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                                    connected ? "bg-[#13b6ec]/15" : "bg-[#1a2c32]"
                                }`}
                            >
                                <span
                                    className={`material-symbols-outlined text-[22px] ${
                                        connected ? "text-[#13b6ec]" : "text-[#325a67]"
                                    }`}
                                >
                                    {connected ? "check_circle" : "link_off"}
                                </span>
                            </div>
                            <div>
                                <p className="text-white font-semibold text-sm">
                                    {isLoading ? "Verificando…" : connected ? "Conectado" : "Desconectado"}
                                </p>
                                <p className="text-[#92bbc9] text-xs">
                                    {connected && status?.external_id_masked
                                        ? `Chat ${status.external_id_masked}`
                                        : "Nenhum Telegram vinculado"}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {connected ? (
                                <>
                                    <AsyncButton
                                        icon="send"
                                        isPending={test.isPending}
                                        loadingLabel="Enviando…"
                                        onClick={handleTest}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1a2c32] border border-[#233f48] text-white hover:border-[#325a67] transition-colors"
                                    >
                                        Testar envio
                                    </AsyncButton>
                                    <AsyncButton
                                        icon="link_off"
                                        isPending={disconnect.isPending}
                                        loadingLabel="Desconectando…"
                                        onClick={handleDisconnect}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-transparent border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                        Desconectar
                                    </AsyncButton>
                                </>
                            ) : (
                                <AsyncButton
                                    icon="add_link"
                                    isPending={connect.isPending}
                                    loadingLabel="Gerando código…"
                                    onClick={handleConnect}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#13b6ec] text-[#101d22] hover:bg-[#13b6ec]/90 transition-colors"
                                >
                                    Conectar
                                </AsyncButton>
                            )}
                        </div>
                    </div>

                    {testFeedback && (
                        <div
                            className={`mt-4 text-sm rounded-lg px-3 py-2 ${
                                testFeedback.ok
                                    ? "bg-[#13b6ec]/10 text-[#13b6ec] border border-[#13b6ec]/30"
                                    : "bg-red-500/10 text-red-400 border border-red-500/30"
                            }`}
                        >
                            {testFeedback.msg}
                        </div>
                    )}
                    {actionError && (
                        <div className="mt-4 text-sm rounded-lg px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30">
                            {actionError}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de conexão */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Conectar Telegram" maxWidthClass="max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#233f48] shrink-0">
                    <h3 className="text-base font-bold text-white">Conectar Telegram</h3>
                    <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        className="text-[#92bbc9] hover:text-white transition-colors"
                        aria-label="Fechar"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {connected ? (
                        <div className="flex flex-col items-center text-center py-6">
                            <div className="w-14 h-14 rounded-full bg-[#13b6ec]/15 flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-[#13b6ec] text-3xl">check_circle</span>
                            </div>
                            <p className="text-white font-bold mb-1">Telegram conectado!</p>
                            <p className="text-sm text-[#92bbc9]">Você já pode receber alertas operacionais.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-5">
                            <ol className="flex flex-col gap-4 text-sm text-[#cfe3ea]">
                                <li className="flex gap-3">
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#1a2c32] border border-[#233f48] flex items-center justify-center text-xs font-bold text-[#13b6ec]">
                                        1
                                    </span>
                                    <span>
                                        Abra o bot:{" "}
                                        <a
                                            href={`https://t.me/${BOT_USERNAME}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#13b6ec] font-semibold underline underline-offset-2"
                                        >
                                            @{BOT_USERNAME}
                                        </a>
                                    </span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#1a2c32] border border-[#233f48] flex items-center justify-center text-xs font-bold text-[#13b6ec]">
                                        2
                                    </span>
                                    <span>Envie a mensagem abaixo para o bot:</span>
                                </li>
                            </ol>

                            {/* Código */}
                            <div className="rounded-lg border border-[#233f48] bg-[#101d22] p-4">
                                <p className="text-xs text-[#92bbc9] mb-2">Comando para enviar:</p>
                                <div className="flex items-center justify-between gap-3">
                                    <code className="text-[#13b6ec] font-mono text-lg font-bold tracking-wider break-all">
                                        /start {linkData?.token}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(`/start ${linkData?.token ?? ""}`)}
                                        className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a2c32] border border-[#233f48] text-white hover:border-[#325a67] transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">
                                            {copied ? "check" : "content_copy"}
                                        </span>
                                        {copied ? "Copiado" : "Copiar"}
                                    </button>
                                </div>
                            </div>

                            {/* Atalho direto */}
                            {linkData?.deep_link && (
                                <a
                                    href={linkData.deep_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#13b6ec] text-[#101d22] hover:bg-[#13b6ec]/90 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                    Abrir no Telegram
                                </a>
                            )}

                            <div className="flex items-center gap-2 text-xs text-[#92bbc9]">
                                <span className="material-symbols-outlined text-[16px] animate-pulse">sync</span>
                                Aguardando confirmação… esta tela atualiza sozinha quando você vincular.
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
