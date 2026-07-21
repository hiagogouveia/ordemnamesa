"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    useCreateTemporaryTransfer,
    useEndTemporaryTransfer,
} from "@/lib/hooks/use-temporary-transfer";
import { TransferResponsibleError } from "@/lib/hooks/use-checklists";
import type { EquipeMember } from "@/lib/hooks/use-equipe";
import { getDirectAssignmentGroup, getEligibleTransferTargets } from "@/lib/utils/transfer-responsible";
import {
    PERIOD_PRESETS,
    TRANSFER_REASONS,
    describeTransferPeriod,
    endDateForPreset,
    formatShortBR,
    reasonLabel,
    validateWindow,
    type TransferReasonCode,
} from "@/lib/utils/temporary-transfer";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

interface TemporaryTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    checklist: ExtendedChecklist | null;
    restaurantId: string;
    collaborators: EquipeMember[];
    /** Hoje no fuso do RESTAURANTE (useRestaurantNow) — nunca `new Date()` do browser. */
    today: string;
    onSuccess: (message: string) => void;
}

type Step = "pick" | "result";

export function TemporaryTransferModal({
    isOpen,
    onClose,
    checklist,
    restaurantId,
    collaborators,
    today,
    onSuccess,
}: TemporaryTransferModalProps) {
    const backdropRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState<Step>("pick");
    const [targetId, setTargetId] = useState("");
    const [startsOn, setStartsOn] = useState(today);
    const [endsOn, setEndsOn] = useState(today);
    const [reasonCode, setReasonCode] = useState<TransferReasonCode | "">("");
    const [reasonNote, setReasonNote] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [blockedRoutines, setBlockedRoutines] = useState<string[]>([]);
    const [resultMessage, setResultMessage] = useState<string | null>(null);

    const { mutateAsync: createTransfer, isPending: isCreating } = useCreateTemporaryTransfer();
    const { mutateAsync: endTransfer, isPending: isEnding } = useEndTemporaryTransfer();
    const isPending = isCreating || isEnding;

    // Transferência já viva → o modal vira "encerrar antecipadamente".
    const openTransfer = checklist?.temporary_transfer ?? null;
    const isEndMode = !!openTransfer;

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!isOpen) {
            setStep("pick");
            setTargetId("");
            setStartsOn(today);
            setEndsOn(today);
            setReasonCode("");
            setReasonNote("");
            setErrorMessage(null);
            setBlockedRoutines([]);
            setResultMessage(null);
            return;
        }
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isPending) onClose();
        };
        document.addEventListener("keydown", handleKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.body.style.overflow = "";
        };
    }, [isOpen, isPending, onClose, today]);

    // Mesmas regras da transferência permanente: exatamente 1 responsável direto.
    const selected = useMemo(() => (checklist ? [checklist] : []), [checklist]);
    const group = useMemo(() => getDirectAssignmentGroup(selected), [selected]);

    const eligibleTargets = useMemo(() => {
        if (!group.ok || !group.areaIds?.length || !group.sourceUserId) return [];
        return getEligibleTransferTargets(collaborators, group.areaIds, group.sourceUserId);
    }, [group, collaborators]);

    const sourceName = group.sourceName ?? "colaborador";
    const targetName = useMemo(
        () => eligibleTargets.find((m) => m.user_id === targetId)?.name ?? null,
        [eligibleTargets, targetId],
    );

    const windowError = useMemo(
        () => (isEndMode ? null : validateWindow(startsOn, endsOn, today)),
        [isEndMode, startsOn, endsOn, today],
    );
    const noTargets = group.ok && eligibleTargets.length === 0;
    const needsNote = reasonCode === "outro" && reasonNote.trim().length === 0;

    const canSubmit = isEndMode
        ? true
        : group.ok && !!targetId && !windowError && !needsNote && !noTargets;

    if (!isOpen || !mounted || !checklist) return null;

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === backdropRef.current && !isPending) onClose();
    };

    /** Presets só PREENCHEM as datas — o par (início, fim) segue sendo a verdade. */
    const applyPreset = (days: number) => {
        const start = startsOn < today ? today : startsOn;
        setStartsOn(start);
        setEndsOn(endDateForPreset(start, days));
    };

    const handleStartChange = (value: string) => {
        setStartsOn(value);
        // Fim antes do início é sempre erro do usuário arrastando a data de início
        // para frente — empurrar o fim junto evita um estado inválido intermediário.
        if (value > endsOn) setEndsOn(value);
    };

    const handleSubmit = async () => {
        setErrorMessage(null);
        setBlockedRoutines([]);
        try {
            if (isEndMode && openTransfer) {
                await endTransfer({ transferId: openTransfer.id, restaurant_id: restaurantId });
                const back = openTransfer.original?.name ?? "o responsável original";
                setResultMessage(`Transferência encerrada. A rotina voltou para ${back}.`);
                setStep("result");
                onSuccess("Transferência temporária encerrada.");
                return;
            }

            const result = await createTransfer({
                restaurant_id: restaurantId,
                checklist_ids: [checklist.id],
                to_user_id: targetId,
                starts_on: startsOn,
                ends_on: endsOn,
                reason_code: reasonCode || null,
                reason_note: reasonNote.trim() || null,
            });

            const when = result.activated_now > 0
                ? "já está com"
                : `ficará com`;
            setResultMessage(
                `A rotina ${when} ${targetName ?? "o colaborador"} de ${formatShortBR(startsOn)} ` +
                `até ${formatShortBR(endsOn)}, e volta sozinha para ${sourceName} depois.`,
            );
            setStep("result");
            onSuccess("Transferência temporária agendada.");
        } catch (err) {
            if (err instanceof TransferResponsibleError) {
                setErrorMessage(err.message);
                setBlockedRoutines(err.blockedRoutines ?? []);
            } else {
                setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido");
            }
        }
    };

    const title = step === "result"
        ? "Pronto"
        : isEndMode
            ? "Encerrar transferência temporária"
            : "Transferir temporariamente";

    return createPortal(
        <div
            ref={backdropRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-[#101d22] rounded-xl border border-[#233f48] shadow-2xl overflow-hidden">
                <header className="flex items-center justify-between px-6 py-4 border-b border-[#233f48]">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-white">{title}</h2>
                        <p className="text-xs text-[#92bbc9] mt-0.5 truncate">{checklist.name}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="text-[#92bbc9] hover:text-white disabled:opacity-50 shrink-0"
                        aria-label="Fechar"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {step === "pick" && isEndMode && openTransfer && (
                        <>
                            <div className="mb-4 p-4 rounded-lg bg-[#0a1215] border border-[#233f48] space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px] text-amber-400">swap_horiz</span>
                                    <span className="text-[#92bbc9]">Atualmente com:</span>
                                    <span className="text-white font-medium">{openTransfer.temporary?.name ?? "—"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px] text-[#92bbc9]">event</span>
                                    <span className="text-[#92bbc9]">Período:</span>
                                    <span className="text-white font-medium">
                                        {describeTransferPeriod(openTransfer.starts_on, openTransfer.ends_on)}
                                    </span>
                                </div>
                                {reasonLabel(openTransfer.reason_code) && (
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[16px] text-[#92bbc9]">label</span>
                                        <span className="text-[#92bbc9]">Motivo:</span>
                                        <span className="text-white font-medium">
                                            {reasonLabel(openTransfer.reason_code)}
                                            {openTransfer.reason_note ? ` — ${openTransfer.reason_note}` : ""}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                <p className="text-sm text-white">
                                    A rotina volta <span className="font-bold">imediatamente</span> para{" "}
                                    <span className="font-bold text-amber-300">{openTransfer.original?.name ?? "o responsável original"}</span>.
                                </p>
                                <p className="text-xs text-[#92bbc9] mt-2">
                                    O encerramento fica registrado no histórico da rotina, com quem encerrou e quando.
                                </p>
                            </div>
                        </>
                    )}

                    {step === "pick" && !isEndMode && (
                        <>
                            <div className="mb-4 p-4 rounded-lg bg-[#0a1215] border border-[#233f48]">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="material-symbols-outlined text-[16px] text-[#92bbc9]">person</span>
                                    <span className="text-[#92bbc9]">Responsável atual:</span>
                                    <span className="text-white font-medium">{sourceName}</span>
                                </div>
                            </div>

                            {!group.ok ? (
                                <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                    <span className="material-symbols-outlined text-[18px] text-amber-400">info</span>
                                    <span className="text-sm font-medium text-amber-300">{group.reason}</span>
                                </div>
                            ) : noTargets ? (
                                <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                    <span className="material-symbols-outlined text-[18px] text-amber-400">info</span>
                                    <span className="text-sm font-medium text-amber-300">
                                        Não há outro colaborador ativo nesta área para cobrir a rotina.
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <label htmlFor="tt-target" className="block text-sm font-bold text-white mb-2">
                                        Novo responsável
                                    </label>
                                    <select
                                        id="tt-target"
                                        value={targetId}
                                        onChange={(e) => setTargetId(e.target.value)}
                                        disabled={isPending}
                                        className="w-full px-3 py-2.5 rounded-lg bg-[#0a1215] border border-[#233f48] text-sm text-white focus:outline-none focus:border-[#13b6ec] disabled:opacity-50"
                                    >
                                        <option value="">Selecione um colaborador…</option>
                                        {eligibleTargets.map((m) => (
                                            <option key={m.user_id} value={m.user_id}>{m.name}</option>
                                        ))}
                                    </select>

                                    {/* Período — datas são a fonte da verdade; os chips só as preenchem. */}
                                    <div className="mt-5">
                                        <span className="block text-sm font-bold text-white mb-2">Período</span>
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {PERIOD_PRESETS.map((p) => (
                                                <button
                                                    key={p.label}
                                                    type="button"
                                                    onClick={() => applyPreset(p.days)}
                                                    disabled={isPending}
                                                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#16262c] border border-[#233f48] text-[#92bbc9] hover:text-white hover:border-[#13b6ec]/50 transition-colors disabled:opacity-50"
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label htmlFor="tt-start" className="block text-xs text-[#92bbc9] mb-1">Início</label>
                                                <input
                                                    id="tt-start"
                                                    type="date"
                                                    value={startsOn}
                                                    min={today}
                                                    onChange={(e) => handleStartChange(e.target.value)}
                                                    disabled={isPending}
                                                    className="w-full px-3 py-2 rounded-lg bg-[#0a1215] border border-[#233f48] text-sm text-white focus:outline-none focus:border-[#13b6ec] disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label htmlFor="tt-end" className="block text-xs text-[#92bbc9] mb-1">Fim</label>
                                                <input
                                                    id="tt-end"
                                                    type="date"
                                                    value={endsOn}
                                                    min={startsOn}
                                                    onChange={(e) => setEndsOn(e.target.value)}
                                                    disabled={isPending}
                                                    className="w-full px-3 py-2 rounded-lg bg-[#0a1215] border border-[#233f48] text-sm text-white focus:outline-none focus:border-[#13b6ec] disabled:opacity-50"
                                                />
                                            </div>
                                        </div>
                                        {windowError && (
                                            <p className="mt-2 text-xs text-red-300">{windowError}</p>
                                        )}
                                    </div>

                                    {/* Motivo — puramente informativo; enriquece a auditoria. */}
                                    <div className="mt-5">
                                        <label htmlFor="tt-reason" className="block text-sm font-bold text-white mb-2">
                                            Motivo <span className="font-normal text-[#5a8a99]">(opcional)</span>
                                        </label>
                                        <select
                                            id="tt-reason"
                                            value={reasonCode}
                                            onChange={(e) => setReasonCode(e.target.value as TransferReasonCode | "")}
                                            disabled={isPending}
                                            className="w-full px-3 py-2.5 rounded-lg bg-[#0a1215] border border-[#233f48] text-sm text-white focus:outline-none focus:border-[#13b6ec] disabled:opacity-50"
                                        >
                                            <option value="">Não informar</option>
                                            {TRANSFER_REASONS.map((r) => (
                                                <option key={r.code} value={r.code}>{r.label}</option>
                                            ))}
                                        </select>
                                        {reasonCode === "outro" && (
                                            <textarea
                                                value={reasonNote}
                                                onChange={(e) => setReasonNote(e.target.value)}
                                                disabled={isPending}
                                                rows={2}
                                                maxLength={280}
                                                placeholder="Descreva o motivo…"
                                                className="mt-2 w-full px-3 py-2 rounded-lg bg-[#0a1215] border border-[#233f48] text-sm text-white placeholder:text-[#5a8a99] focus:outline-none focus:border-[#13b6ec] disabled:opacity-50 resize-none"
                                            />
                                        )}
                                    </div>

                                    {/* Resumo — o gestor confirma DATAS CONCRETAS, nunca "N dias". */}
                                    {targetName && !windowError && (
                                        <div className="mt-5 p-4 rounded-lg bg-[#13b6ec]/5 border border-[#13b6ec]/20 space-y-1.5 text-sm">
                                            <p className="text-[#92bbc9]">
                                                Esta rotina ficará atribuída para{" "}
                                                <span className="font-bold text-white">{targetName}</span>
                                            </p>
                                            <p className="text-[#92bbc9]">
                                                Durante{" "}
                                                <span className="font-bold text-[#13b6ec]">
                                                    {describeTransferPeriod(startsOn, endsOn)}
                                                </span>
                                            </p>
                                            <p className="text-[#92bbc9]">
                                                Depois volta automaticamente para{" "}
                                                <span className="font-bold text-white">{sourceName}</span>
                                            </p>
                                            {reasonLabel(reasonCode) && (
                                                <p className="text-[#92bbc9]">
                                                    Motivo: <span className="font-bold text-white">{reasonLabel(reasonCode)}</span>
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {step === "pick" && errorMessage && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-red-400">error</span>
                                <span className="text-xs font-medium text-red-300">{errorMessage}</span>
                            </div>
                            {blockedRoutines.length > 0 && (
                                <ul className="mt-2 ml-6 list-disc space-y-0.5">
                                    {blockedRoutines.map((name) => (
                                        <li key={name} className="text-xs text-red-300/90">{name}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {step === "result" && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <span className="material-symbols-outlined text-[40px] text-emerald-400">check_circle</span>
                            <p className="text-sm text-white">{resultMessage}</p>
                        </div>
                    )}
                </div>

                <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#233f48]">
                    {step === "pick" ? (
                        <>
                            <button
                                onClick={onClose}
                                disabled={isPending}
                                className="px-4 py-2 text-sm font-bold text-[#92bbc9] hover:text-white bg-[#16262c] border border-[#233f48] rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!canSubmit || isPending}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isEndMode
                                        ? "bg-amber-500 hover:bg-amber-400 text-[#0a1215]"
                                        : "bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215]"
                                }`}
                            >
                                {isPending ? (
                                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[16px]">
                                        {isEndMode ? "undo" : "schedule"}
                                    </span>
                                )}
                                {isEndMode ? "Encerrar agora" : "Confirmar"}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-bold bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] rounded-lg transition-colors"
                        >
                            Concluir
                        </button>
                    )}
                </footer>
            </div>
        </div>,
        document.body,
    );
}
