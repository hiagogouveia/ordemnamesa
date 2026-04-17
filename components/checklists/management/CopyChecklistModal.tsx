"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUnits } from "@/lib/hooks/use-units";
import { useAllAreas } from "@/lib/hooks/use-areas";
import {
    useReplicateChecklists,
    type ReplicationResponse,
    type ReplicationResultRow,
} from "@/lib/hooks/use-checklists";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

interface CopyChecklistModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedChecklists: ExtendedChecklist[];
    accountId: string | null;
    sourceRestaurantIds: string[];
}

type Step = "pick-target" | "result";

interface AreaSummary {
    name: string;
    count: number;
    willCreate: boolean;
}

export function CopyChecklistModal({
    isOpen,
    onClose,
    selectedChecklists,
    accountId,
    sourceRestaurantIds,
}: CopyChecklistModalProps) {
    const backdropRef = useRef<HTMLDivElement>(null);
    const [step, setStep] = useState<Step>("pick-target");
    const [targetId, setTargetId] = useState<string | null>(null);
    const [response, setResponse] = useState<ReplicationResponse | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const { data: units = [], isLoading: loadingUnits } = useUnits(accountId);
    const { data: targetAreas = [] } = useAllAreas(targetId ?? undefined);
    const { mutateAsync: replicate, isPending } = useReplicateChecklists();

    // Unidades destino disponíveis (exclui as de origem)
    const availableTargets = useMemo(
        () => units.filter((u) => u.active && !sourceRestaurantIds.includes(u.id)),
        [units, sourceRestaurantIds]
    );

    // Nomes de unidades para lookup
    const unitById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const u of units) map[u.id] = u.name;
        return map;
    }, [units]);

    // Resumo por unidade de origem
    const originSummary = useMemo(() => {
        const map: Record<string, { name: string; count: number }> = {};
        for (const c of selectedChecklists) {
            const rid = c.restaurant_id;
            if (!map[rid]) {
                map[rid] = { name: c.unit?.name ?? unitById[rid] ?? "Unidade desconhecida", count: 0 };
            }
            map[rid].count++;
        }
        return Object.values(map);
    }, [selectedChecklists, unitById]);

    // Resumo de áreas (quais serão criadas vs reutilizadas)
    const areaSummary = useMemo((): { areas: AreaSummary[]; noAreaCount: number } => {
        if (!targetId) return { areas: [], noAreaCount: 0 };

        const targetAreaNames = new Set(targetAreas.map((a) => a.name.toLowerCase()));
        const areaMap: Record<string, { name: string; count: number }> = {};
        let noAreaCount = 0;

        for (const c of selectedChecklists) {
            if (!c.area?.name) {
                noAreaCount++;
                continue;
            }
            const key = c.area.name.toLowerCase();
            if (!areaMap[key]) {
                areaMap[key] = { name: c.area.name, count: 0 };
            }
            areaMap[key].count++;
        }

        const areas = Object.entries(areaMap).map(([key, { name, count }]) => ({
            name,
            count,
            willCreate: !targetAreaNames.has(key),
        }));

        // Ordenar: primeiro as que serão criadas
        areas.sort((a, b) => {
            if (a.willCreate !== b.willCreate) return a.willCreate ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return { areas, noAreaCount };
    }, [selectedChecklists, targetAreas, targetId]);

    // Reset ao fechar
    useEffect(() => {
        if (!isOpen) {
            setStep("pick-target");
            setTargetId(null);
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

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === backdropRef.current && !isPending) onClose();
    };

    const handleCopy = async () => {
        if (!targetId || selectedChecklists.length === 0) return;
        setErrorMessage(null);
        setResponse(null);
        try {
            const result = await replicate({
                checklist_ids: selectedChecklists.map((c) => c.id),
                target_restaurant_ids: [targetId],
            });
            setResponse(result);
            setStep("result");
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido");
        }
    };

    const groupedResults = useMemo(() => {
        if (!response) return null;
        const byStatus: Record<string, ReplicationResultRow[]> = {
            created: [],
            skipped: [],
            error: [],
        };
        for (const row of response.results) {
            (byStatus[row.status] ??= []).push(row);
        }
        return byStatus;
    }, [response]);

    const selectedTargetName = targetId ? (unitById[targetId] ?? "Unidade") : null;

    const title = step === "pick-target"
        ? "Copiar rotinas para outra unidade"
        : "Resultado da cópia";

    const subtitle = step === "pick-target"
        ? `${selectedChecklists.length} rotina${selectedChecklists.length !== 1 ? "s" : ""} selecionada${selectedChecklists.length !== 1 ? "s" : ""}`
        : null;

    // Lookup de nome de checklist por ID
    const checklistNameById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const c of selectedChecklists) map[c.id] = c.name;
        return map;
    }, [selectedChecklists]);

    return createPortal(
        <div
            ref={backdropRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-xl max-h-[85vh] flex flex-col bg-[#101d22] rounded-xl border border-[#233f48] shadow-2xl overflow-hidden">
                {/* Header */}
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

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {step === "pick-target" && (
                        <>
                            {/* Seletor de unidade destino */}
                            <h3 className="text-sm font-bold text-white mb-3">Unidade destino</h3>

                            {loadingUnits ? (
                                <div className="flex items-center gap-2 text-[#92bbc9] text-sm py-4">
                                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                                    Carregando unidades...
                                </div>
                            ) : availableTargets.length === 0 ? (
                                <div className="text-[#92bbc9] text-sm py-4">
                                    Nenhuma unidade destino disponível.
                                </div>
                            ) : (
                                <div className="space-y-1.5 mb-6">
                                    {availableTargets.map((unit) => (
                                        <label
                                            key={unit.id}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border ${
                                                targetId === unit.id
                                                    ? "bg-[#13b6ec]/10 border-[#13b6ec]/30"
                                                    : "border-transparent hover:bg-[#16262c]"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="target-unit"
                                                value={unit.id}
                                                checked={targetId === unit.id}
                                                onChange={() => setTargetId(unit.id)}
                                                className="accent-[#13b6ec]"
                                            />
                                            <span className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[16px] text-[#92bbc9]">storefront</span>
                                                <span className="text-sm text-white">{unit.name}</span>
                                                {unit.is_primary && (
                                                    <span className="text-[9px] font-bold text-[#13b6ec] bg-[#13b6ec]/10 border border-[#13b6ec]/20 px-1.5 py-0.5 rounded-full uppercase">
                                                        Principal
                                                    </span>
                                                )}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {/* Resumo inteligente (quando destino selecionado) */}
                            {targetId && selectedTargetName && (
                                <div className="mt-2 p-4 rounded-lg bg-[#0a1215] border border-[#233f48]">
                                    <p className="text-sm text-white font-medium mb-3">
                                        Você está copiando{" "}
                                        <span className="text-[#13b6ec] font-bold">{selectedChecklists.length} rotina{selectedChecklists.length !== 1 ? "s" : ""}</span>
                                        {" "}para{" "}
                                        <span className="text-[#13b6ec] font-bold">&apos;{selectedTargetName}&apos;</span>
                                    </p>

                                    {/* Origem */}
                                    {originSummary.length > 1 && (
                                        <div className="mb-3">
                                            <p className="text-xs font-bold text-[#92bbc9] uppercase tracking-wide mb-1.5">Origem</p>
                                            <ul className="space-y-1">
                                                {originSummary.map((o) => (
                                                    <li key={o.name} className="flex items-center gap-2 text-sm text-[#92bbc9]">
                                                        <span className="material-symbols-outlined text-[14px]">storefront</span>
                                                        {o.name}
                                                        <span className="text-[#325a67]">({o.count} {o.count === 1 ? "rotina" : "rotinas"})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Áreas */}
                                    {areaSummary.areas.length > 0 && (
                                        <div className="mb-3">
                                            <p className="text-xs font-bold text-[#92bbc9] uppercase tracking-wide mb-1.5">Áreas</p>
                                            <ul className="space-y-1">
                                                {areaSummary.areas.map((a) => (
                                                    <li key={a.name} className="flex items-center gap-2 text-sm">
                                                        <span
                                                            className={`w-2 h-2 rounded-full shrink-0 ${
                                                                a.willCreate ? "bg-emerald-400" : "bg-[#325a67]"
                                                            }`}
                                                        />
                                                        <span className="text-[#92bbc9]">
                                                            {a.name}
                                                            <span className="text-[#325a67]"> ({a.count} {a.count === 1 ? "rotina" : "rotinas"})</span>
                                                        </span>
                                                        <span
                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                a.willCreate
                                                                    ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                                                                    : "text-[#5a8a99] bg-[#16262c] border border-[#233f48]"
                                                            }`}
                                                        >
                                                            {a.willCreate ? "será criada" : "já existe"}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Warning: rotinas sem área */}
                                    {areaSummary.noAreaCount > 0 && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                            <span className="material-symbols-outlined text-[16px] text-amber-400">warning</span>
                                            <span className="text-xs font-medium text-amber-300">
                                                {areaSummary.noAreaCount} rotina{areaSummary.noAreaCount !== 1 ? "s" : ""} sem área vinculada
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Erro */}
                            {errorMessage && (
                                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <span className="material-symbols-outlined text-[16px] text-red-400">error</span>
                                    <span className="text-xs font-medium text-red-300">{errorMessage}</span>
                                </div>
                            )}
                        </>
                    )}

                    {step === "result" && response && (
                        <>
                            {/* Summary tiles */}
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <SummaryTile
                                    label="Criadas"
                                    count={response.summary.created}
                                    icon="check_circle"
                                    color="#22c55e"
                                />
                                <SummaryTile
                                    label="Ignoradas"
                                    count={response.summary.skipped}
                                    icon="block"
                                    color="#eab308"
                                />
                                <SummaryTile
                                    label="Erros"
                                    count={response.summary.errors}
                                    icon="error"
                                    color="#ef4444"
                                />
                            </div>

                            {/* Detalhes por checklist */}
                            {groupedResults && (
                                <div className="space-y-3">
                                    {groupedResults.created.length > 0 && (
                                        <ResultSection
                                            title="Rotinas copiadas"
                                            rows={groupedResults.created}
                                            checklistNameById={checklistNameById}
                                            color="#22c55e"
                                        />
                                    )}
                                    {groupedResults.skipped.length > 0 && (
                                        <ResultSection
                                            title="Rotinas ignoradas (já existem)"
                                            rows={groupedResults.skipped}
                                            checklistNameById={checklistNameById}
                                            color="#eab308"
                                        />
                                    )}
                                    {groupedResults.error.length > 0 && (
                                        <ResultSection
                                            title="Erros"
                                            rows={groupedResults.error}
                                            checklistNameById={checklistNameById}
                                            color="#ef4444"
                                        />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#233f48]">
                    {step === "pick-target" && (
                        <>
                            <button
                                onClick={onClose}
                                disabled={isPending}
                                className="px-4 py-2 text-sm font-bold text-[#92bbc9] hover:text-white bg-[#16262c] border border-[#233f48] rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCopy}
                                disabled={!targetId || isPending}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPending ? (
                                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                                )}
                                Copiar {selectedChecklists.length} rotina{selectedChecklists.length !== 1 ? "s" : ""}
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

// ─── Sub-components ─────────────────────────────────────────────────────────

function SummaryTile({
    label,
    count,
    icon,
    color,
}: {
    label: string;
    count: number;
    icon: string;
    color: string;
}) {
    return (
        <div
            className="flex flex-col items-center gap-1 py-3 rounded-lg border"
            style={{
                backgroundColor: `${color}10`,
                borderColor: `${color}30`,
            }}
        >
            <span className="material-symbols-outlined text-[20px]" style={{ color }}>
                {icon}
            </span>
            <span className="text-xl font-bold text-white">{count}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>
                {label}
            </span>
        </div>
    );
}

function ResultSection({
    title,
    rows,
    checklistNameById,
    color,
}: {
    title: string;
    rows: ReplicationResultRow[];
    checklistNameById: Record<string, string>;
    color: string;
}) {
    return (
        <div>
            <h4 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color }}>
                {title}
            </h4>
            <div className="space-y-1">
                {rows.map((row) => (
                    <div
                        key={row.source_checklist_id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#16262c] border border-[#233f48]"
                    >
                        <span className="text-sm text-[#92bbc9] truncate">
                            {checklistNameById[row.source_checklist_id] ?? row.source_checklist_id}
                        </span>
                        {row.error_message && (
                            <span className="text-[10px] text-red-400 shrink-0">{row.error_message}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
