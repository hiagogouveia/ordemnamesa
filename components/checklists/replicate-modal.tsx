"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUnits } from "@/lib/hooks/use-units";
import {
    useReplicateChecklists,
    type ReplicationResponse,
    type ReplicationResultRow,
} from "@/lib/hooks/use-checklists";

export interface AvailableChecklist {
    id: string;
    name: string;
}

export interface ReplicateChecklistsModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountId: string | null;
    currentRestaurantId: string | null;
    availableChecklists: AvailableChecklist[];
}

type Step = "pick-checklists" | "pick-targets" | "result";

export function ReplicateChecklistsModal({
    isOpen,
    onClose,
    accountId,
    currentRestaurantId,
    availableChecklists,
}: ReplicateChecklistsModalProps) {
    const backdropRef = useRef<HTMLDivElement>(null);
    const [step, setStep] = useState<Step>("pick-checklists");
    const [checklistIds, setChecklistIds] = useState<Set<string>>(new Set());
    const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [response, setResponse] = useState<ReplicationResponse | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const { data: units = [], isLoading: loadingUnits } = useUnits(accountId);
    const { mutateAsync: replicate, isPending } = useReplicateChecklists();

    const availableTargets = useMemo(
        () => units.filter((u) => u.active && u.id !== currentRestaurantId),
        [units, currentRestaurantId]
    );

    const checklistById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const c of availableChecklists) map[c.id] = c.name;
        return map;
    }, [availableChecklists]);

    const unitById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const u of units) map[u.id] = u.name;
        return map;
    }, [units]);

    const filteredChecklists = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return availableChecklists;
        return availableChecklists.filter((c) => c.name.toLowerCase().includes(q));
    }, [availableChecklists, search]);

    useEffect(() => {
        if (!isOpen) {
            setStep("pick-checklists");
            setChecklistIds(new Set());
            setTargetIds(new Set());
            setSearch("");
            setResponse(null);
            setErrorMessage(null);
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

    if (!isOpen) return null;

    const toggleChecklist = (id: string) => {
        setChecklistIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleTarget = (id: string) => {
        setTargetIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === backdropRef.current && !isPending) onClose();
    };

    const handleReplicate = async () => {
        if (checklistIds.size === 0 || targetIds.size === 0) return;
        setErrorMessage(null);
        setResponse(null);
        try {
            const result = await replicate({
                checklist_ids: Array.from(checklistIds),
                target_restaurant_ids: Array.from(targetIds),
            });
            setResponse(result);
            setStep("result");
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido");
        }
    };

    const groupedResults = useMemo(() => {
        if (!response) return null;
        const byTarget: Record<string, ReplicationResultRow[]> = {};
        for (const row of response.results) {
            (byTarget[row.target_restaurant_id] ??= []).push(row);
        }
        return byTarget;
    }, [response]);

    const title =
        step === "pick-checklists"
            ? "Selecione as rotinas"
            : step === "pick-targets"
                ? "Selecione as unidades destino"
                : "Resultado da replicação";

    const subtitle =
        step === "pick-checklists"
            ? `${checklistIds.size} de ${availableChecklists.length} selecionada${checklistIds.size !== 1 ? "s" : ""}`
            : step === "pick-targets"
                ? `${checklistIds.size} rotina${checklistIds.size !== 1 ? "s" : ""} → ${targetIds.size} unidade${targetIds.size !== 1 ? "s" : ""}`
                : null;

    return createPortal(
        <div
            ref={backdropRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-xl max-h-[85vh] flex flex-col bg-[#101d22] rounded-xl border border-[#233f48] shadow-2xl overflow-hidden">
                <header className="flex items-center justify-between px-6 py-4 border-b border-[#233f48]">
                    <div>
                        <h2 className="text-lg font-semibold text-white">{title}</h2>
                        {subtitle && (
                            <p className="text-xs text-[#92bbc9] mt-0.5">{subtitle}</p>
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

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {step === "pick-checklists" && (
                        <>
                            <div className="mb-3">
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar rotina..."
                                    className="w-full bg-[#1a2c32] border border-[#233f48] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#92bbc9] focus:outline-none focus:border-[#13b6ec]"
                                />
                            </div>

                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-[#92bbc9]">
                                    {filteredChecklists.length} rotina{filteredChecklists.length !== 1 ? "s" : ""} listada{filteredChecklists.length !== 1 ? "s" : ""}
                                </span>
                                <div className="flex gap-2 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setChecklistIds(new Set(filteredChecklists.map((c) => c.id)))}
                                        className="text-[#13b6ec] hover:underline"
                                    >
                                        Selecionar visíveis
                                    </button>
                                    <span className="text-[#233f48]">|</span>
                                    <button
                                        type="button"
                                        onClick={() => setChecklistIds(new Set())}
                                        className="text-[#92bbc9] hover:underline"
                                    >
                                        Limpar
                                    </button>
                                </div>
                            </div>

                            {filteredChecklists.length === 0 ? (
                                <div className="text-sm text-[#92bbc9] py-6 text-center border border-dashed border-[#233f48] rounded-lg">
                                    {search ? "Nenhuma rotina encontrada." : "Nenhuma rotina disponível para exportar."}
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {filteredChecklists.map((c) => {
                                        const checked = checklistIds.has(c.id);
                                        return (
                                            <li key={c.id}>
                                                <label
                                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                                                        checked
                                                            ? "bg-[#13b6ec]/10 border-[#13b6ec]/40"
                                                            : "bg-[#1a2c32] border-[#233f48] hover:border-[#355a66]"
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleChecklist(c.id)}
                                                        className="size-4 accent-[#13b6ec]"
                                                    />
                                                    <span className="flex-1 text-sm text-white truncate">{c.name}</span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            <p className="mt-4 text-xs text-[#7a9fad] leading-relaxed">
                                A replicação copia o checklist e suas tarefas. O colaborador responsável e o cargo <strong className="text-[#92bbc9]">não são copiados</strong> — defina-os na unidade destino após importar. Rotinas já replicadas (mesma origem) são ignoradas.
                            </p>
                        </>
                    )}

                    {step === "pick-targets" && (
                        <>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs uppercase tracking-wide text-[#92bbc9]">
                                    Unidades destino
                                </span>
                                <div className="flex gap-2 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setTargetIds(new Set(availableTargets.map((u) => u.id)))}
                                        className="text-[#13b6ec] hover:underline"
                                    >
                                        Selecionar todas
                                    </button>
                                    <span className="text-[#233f48]">|</span>
                                    <button
                                        type="button"
                                        onClick={() => setTargetIds(new Set())}
                                        className="text-[#92bbc9] hover:underline"
                                    >
                                        Limpar
                                    </button>
                                </div>
                            </div>

                            {loadingUnits ? (
                                <div className="text-sm text-[#92bbc9] py-6 text-center">
                                    Carregando unidades...
                                </div>
                            ) : availableTargets.length === 0 ? (
                                <div className="text-sm text-[#92bbc9] py-6 text-center border border-dashed border-[#233f48] rounded-lg">
                                    Nenhuma outra unidade disponível nesta conta.
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {availableTargets.map((u) => {
                                        const checked = targetIds.has(u.id);
                                        return (
                                            <li key={u.id}>
                                                <label
                                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                                                        checked
                                                            ? "bg-[#13b6ec]/10 border-[#13b6ec]/40"
                                                            : "bg-[#1a2c32] border-[#233f48] hover:border-[#355a66]"
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleTarget(u.id)}
                                                        className="size-4 accent-[#13b6ec]"
                                                    />
                                                    <span className="material-symbols-outlined text-[#92bbc9] text-[18px]">
                                                        storefront
                                                    </span>
                                                    <span className="flex-1 text-sm text-white">{u.name}</span>
                                                    {u.is_primary && (
                                                        <span className="text-[10px] uppercase tracking-wide text-[#92bbc9]">
                                                            Principal
                                                        </span>
                                                    )}
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {errorMessage && (
                                <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                                    {errorMessage}
                                </div>
                            )}
                        </>
                    )}

                    {step === "result" && response && groupedResults && (
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-2">
                                <SummaryTile label="Criadas" value={response.summary.created} tone="success" />
                                <SummaryTile label="Puladas" value={response.summary.skipped} tone="muted" />
                                <SummaryTile label="Erros" value={response.summary.errors} tone="error" />
                            </div>

                            <div className="flex flex-col gap-3">
                                {Object.entries(groupedResults).map(([targetId, rows]) => (
                                    <div
                                        key={targetId}
                                        className="rounded-lg border border-[#233f48] bg-[#1a2c32] overflow-hidden"
                                    >
                                        <div className="px-3 py-2 border-b border-[#233f48] flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#92bbc9] text-[18px]">
                                                storefront
                                            </span>
                                            <span className="text-sm font-medium text-white">
                                                {unitById[targetId] ?? targetId.slice(0, 8)}
                                            </span>
                                        </div>
                                        <ul className="divide-y divide-[#233f48]">
                                            {rows.map((r) => (
                                                <li
                                                    key={`${r.target_restaurant_id}-${r.source_checklist_id}`}
                                                    className="px-3 py-2 flex items-start gap-2 text-xs"
                                                >
                                                    <StatusBadge status={r.status} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[#d6e6eb] truncate">
                                                            {checklistById[r.source_checklist_id] ?? r.source_checklist_id.slice(0, 8)}
                                                        </div>
                                                        {r.error_message && (
                                                            <div className="text-[11px] text-[#92bbc9] mt-0.5">
                                                                {r.error_message}
                                                            </div>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <footer className="px-6 py-4 border-t border-[#233f48] flex items-center justify-end gap-2">
                    {step === "pick-checklists" && (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-[#92bbc9] hover:text-white"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep("pick-targets")}
                                disabled={checklistIds.size === 0}
                                className="px-4 py-2 text-sm rounded-lg bg-[#13b6ec] text-[#0a1215] font-semibold hover:bg-[#13b6ec]/90 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Avançar ({checklistIds.size})
                            </button>
                        </>
                    )}
                    {step === "pick-targets" && (
                        <>
                            <button
                                type="button"
                                onClick={() => setStep("pick-checklists")}
                                disabled={isPending}
                                className="px-4 py-2 text-sm text-[#92bbc9] hover:text-white disabled:opacity-50"
                            >
                                Voltar
                            </button>
                            <button
                                type="button"
                                onClick={handleReplicate}
                                disabled={isPending || targetIds.size === 0 || !accountId}
                                className="px-4 py-2 text-sm rounded-lg bg-[#13b6ec] text-[#0a1215] font-semibold hover:bg-[#13b6ec]/90 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isPending
                                    ? "Replicando..."
                                    : `Replicar para ${targetIds.size} ${targetIds.size === 1 ? "unidade" : "unidades"}`}
                            </button>
                        </>
                    )}
                    {step === "result" && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg bg-[#13b6ec] text-[#0a1215] font-semibold hover:bg-[#13b6ec]/90"
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

function SummaryTile({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: "success" | "muted" | "error";
}) {
    const palette = {
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        muted: "border-[#233f48] bg-[#1a2c32] text-[#92bbc9]",
        error: "border-red-500/30 bg-red-500/10 text-red-300",
    }[tone];
    return (
        <div className={`rounded-lg border px-3 py-2 text-center ${palette}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
            <div className="text-xl font-bold">{value}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: ReplicationResultRow["status"] }) {
    const map = {
        created: { label: "Criada", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
        skipped: { label: "Pulada", cls: "bg-[#233f48] text-[#92bbc9] border-[#355a66]" },
        error: { label: "Erro", cls: "bg-red-500/10 text-red-300 border-red-500/30" },
    }[status];
    return (
        <span
            className={`shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${map.cls}`}
        >
            {map.label}
        </span>
    );
}
