"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    useTransferChecklistResponsible,
    TransferResponsibleError,
} from "@/lib/hooks/use-checklists";
import type { EquipeMember } from "@/lib/hooks/use-equipe";
import {
    getDirectAssignmentGroup,
    getEligibleTransferTargets,
} from "@/lib/utils/transfer-responsible";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

interface TransferResponsibleModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedChecklists: ExtendedChecklist[];
    restaurantId: string;
    collaborators: EquipeMember[];
    onSuccess: (count: number) => void;
}

type Step = "pick" | "result";

export function TransferResponsibleModal({
    isOpen,
    onClose,
    selectedChecklists,
    restaurantId,
    collaborators,
    onSuccess,
}: TransferResponsibleModalProps) {
    const backdropRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState<Step>("pick");
    const [targetId, setTargetId] = useState<string>("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [blockedRoutines, setBlockedRoutines] = useState<string[]>([]);
    const [transferredCount, setTransferredCount] = useState(0);
    // Nome do destino capturado no momento da transferência — a lista é
    // invalidada no sucesso e o `targetName` derivado deixaria de resolver.
    const [resultTargetName, setResultTargetName] = useState<string | null>(null);

    const { mutateAsync: transfer, isPending } = useTransferChecklistResponsible();

    useEffect(() => { setMounted(true); }, []);

    // Reset ao fechar; ESC/scroll lock ao abrir.
    useEffect(() => {
        if (!isOpen) {
            setStep("pick");
            setTargetId("");
            setErrorMessage(null);
            setBlockedRoutines([]);
            setTransferredCount(0);
            setResultTargetName(null);
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
    }, [isOpen, isPending, onClose]);

    const group = useMemo(
        () => getDirectAssignmentGroup(selectedChecklists),
        [selectedChecklists]
    );

    const eligibleTargets = useMemo(() => {
        if (!group.ok || !group.areaId || !group.sourceUserId) return [];
        return getEligibleTransferTargets(collaborators, group.areaId, group.sourceUserId);
    }, [group, collaborators]);

    const sourceName = group.sourceName ?? "colaborador";
    const areaName = useMemo(() => {
        const first = selectedChecklists[0];
        return first?.area?.name ?? "—";
    }, [selectedChecklists]);
    const targetName = useMemo(
        () => eligibleTargets.find((m) => m.user_id === targetId)?.name ?? null,
        [eligibleTargets, targetId]
    );

    const count = selectedChecklists.length;
    const noTargets = group.ok && eligibleTargets.length === 0;

    if (!isOpen || !mounted) return null;

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === backdropRef.current && !isPending) onClose();
    };

    const handleTransfer = async () => {
        if (!group.ok || !targetId) return;
        setErrorMessage(null);
        setBlockedRoutines([]);
        // Captura o nome do destino antes do sucesso (a lista é invalidada e o
        // `targetName` derivado deixaria de resolver no passo de resultado).
        const destName = targetName;
        try {
            const result = await transfer({
                restaurant_id: restaurantId,
                checklist_ids: selectedChecklists.map((c) => c.id),
                to_user_id: targetId,
            });
            setTransferredCount(result.transferred_count);
            setResultTargetName(destName);
            setStep("result");
            onSuccess(result.transferred_count);
        } catch (err) {
            if (err instanceof TransferResponsibleError) {
                setErrorMessage(err.message);
                setBlockedRoutines(err.blockedRoutines ?? []);
            } else {
                setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido");
            }
        }
    };

    const title = step === "pick" ? "Transferir responsável" : "Transferência concluída";

    return createPortal(
        <div
            ref={backdropRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-[#101d22] rounded-xl border border-[#233f48] shadow-2xl overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-[#233f48]">
                    <div>
                        <h2 className="text-lg font-semibold text-white">{title}</h2>
                        {step === "pick" && (
                            <p className="text-xs text-[#92bbc9] mt-0.5">
                                {count} rotina{count !== 1 ? "s" : ""} selecionada{count !== 1 ? "s" : ""}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="text-[#92bbc9] hover:text-white disabled:opacity-50"
                        aria-label="Fechar"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {step === "pick" && (
                        <>
                            {/* Resumo origem/área */}
                            <div className="mb-4 p-4 rounded-lg bg-[#0a1215] border border-[#233f48] space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="material-symbols-outlined text-[16px] text-[#92bbc9]">person</span>
                                    <span className="text-[#92bbc9]">Origem:</span>
                                    <span className="text-white font-medium">{sourceName}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="material-symbols-outlined text-[16px] text-[#92bbc9]">category</span>
                                    <span className="text-[#92bbc9]">Área:</span>
                                    <span className="text-white font-medium">{areaName}</span>
                                </div>
                            </div>

                            {noTargets ? (
                                <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                    <span className="material-symbols-outlined text-[18px] text-amber-400">info</span>
                                    <span className="text-sm font-medium text-amber-300">
                                        Não há outro colaborador ativo nesta área para receber as rotinas.
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <label className="block text-sm font-bold text-white mb-2">
                                        Transferir para
                                    </label>
                                    <select
                                        value={targetId}
                                        onChange={(e) => setTargetId(e.target.value)}
                                        disabled={isPending}
                                        className="w-full px-3 py-2.5 rounded-lg bg-[#0a1215] border border-[#233f48] text-sm text-white focus:outline-none focus:border-[#13b6ec] disabled:opacity-50"
                                    >
                                        <option value="">Selecione um colaborador…</option>
                                        {eligibleTargets.map((m) => (
                                            <option key={m.user_id} value={m.user_id}>
                                                {m.name}
                                            </option>
                                        ))}
                                    </select>

                                    {/* Confirmação */}
                                    {targetName && (
                                        <div className="mt-4 p-4 rounded-lg bg-[#13b6ec]/5 border border-[#13b6ec]/20">
                                            <p className="text-sm text-white">
                                                Você está prestes a transferir{" "}
                                                <span className="font-bold text-[#13b6ec]">{count} rotina{count !== 1 ? "s" : ""}</span>{" "}
                                                de <span className="font-bold">{sourceName}</span> para{" "}
                                                <span className="font-bold">{targetName}</span>.
                                            </p>
                                            <p className="text-xs text-[#92bbc9] mt-2">
                                                Essa ação altera apenas o responsável das rotinas selecionadas e
                                                não modifica histórico nem execuções anteriores.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Erro */}
                            {errorMessage && (
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
                        </>
                    )}

                    {step === "result" && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <span className="material-symbols-outlined text-[40px] text-emerald-400">check_circle</span>
                            <p className="text-sm text-white">
                                <span className="font-bold">{transferredCount}</span>{" "}
                                rotina{transferredCount !== 1 ? "s" : ""} transferida{transferredCount !== 1 ? "s" : ""}{" "}
                                para <span className="font-bold">{resultTargetName ?? "o colaborador"}</span>.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#233f48]">
                    {step === "pick" && (
                        <>
                            <button
                                onClick={onClose}
                                disabled={isPending}
                                className="px-4 py-2 text-sm font-bold text-[#92bbc9] hover:text-white bg-[#16262c] border border-[#233f48] rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleTransfer}
                                disabled={!group.ok || !targetId || isPending || noTargets}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPending ? (
                                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                                )}
                                Transferir
                            </button>
                        </>
                    )}
                    {step === "result" && (
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
        document.body
    );
}
