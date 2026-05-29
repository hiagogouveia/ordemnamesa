"use client";

import type { RoutineStateInfo, RoutineStateKind } from "@/lib/utils/routine-state";

export type TaskRowKind = "routine" | "receiving";

export interface TaskRowProps {
    kind: TaskRowKind;
    title: string;
    /** Estado operacional consolidado (mesmo do RoutineCard). */
    state: RoutineStateInfo;

    // Metadados
    area?: string | null;
    itemsCount?: number;
    /** Para recebimentos: fornecedor. */
    supplier?: string | null;
    /** Recebimento marcado como manual/sem rotina recorrente. */
    isReceivingOverdue?: boolean;

    // Tempo
    start_time?: string | null;
    end_time?: string | null;
    /** Texto alternativo para o time pill (ex: "Previsão 09:00–11:00"). */
    timeLabelOverride?: string | null;

    // Progresso
    progress?: number;
    flaggedCount?: number;

    // Atribuição
    isRequired?: boolean;
    assumptionName?: string | null;
    isAssignedToMe?: boolean;
    isAssignedToOther?: boolean;

    // Global
    unitName?: string;

    onClick: () => void;
}

interface StateVisual {
    /** Cor da stripe esquerda (Tailwind border-l-*). */
    stripeCls: string;
    /** Cor do ícone de tipo. */
    iconCls: string;
    /** Barra de progresso. */
    progressCls: string;
    /** Etiqueta opcional do estado (ex: "Atrasada"). */
    label: string | null;
    labelCls: string;
}

function buildStateVisual(kind: RoutineStateKind): StateVisual {
    switch (kind) {
        case "blocked":
            return {
                stripeCls: "border-l-amber-500",
                iconCls: "text-amber-400",
                progressCls: "bg-amber-400",
                label: "Impedimento",
                labelCls: "text-amber-400 bg-amber-500/10 border-amber-500/30",
            };
        case "late":
            return {
                stripeCls: "border-l-red-500",
                iconCls: "text-red-400",
                progressCls: "bg-red-400",
                label: "Atrasada",
                labelCls: "text-red-400 bg-red-500/10 border-red-500/30",
            };
        case "doing":
            return {
                stripeCls: "border-l-[#13b6ec]",
                iconCls: "text-[#13b6ec]",
                progressCls: "bg-[#13b6ec]",
                label: "Em execução",
                labelCls: "text-[#13b6ec] bg-[#13b6ec]/10 border-[#13b6ec]/30",
            };
        case "future":
            return {
                stripeCls: "border-l-[#325a67]",
                iconCls: "text-[#92bbc9]",
                progressCls: "bg-[#92bbc9]",
                label: null,
                labelCls: "",
            };
        case "available":
        default:
            return {
                stripeCls: "border-l-[#325a67]",
                iconCls: "text-[#92bbc9]",
                progressCls: "bg-[#92bbc9]",
                label: null,
                labelCls: "",
            };
    }
}

function formatTime(start?: string | null, end?: string | null): string | null {
    if (!start && !end) return null;
    if (start && end) return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
    if (start) return `${start.slice(0, 5)}`;
    if (end) return `até ${end.slice(0, 5)}`;
    return null;
}

export function TaskRow({
    kind,
    title,
    state,
    area,
    itemsCount,
    supplier,
    isReceivingOverdue,
    start_time,
    end_time,
    timeLabelOverride,
    progress,
    flaggedCount = 0,
    isRequired,
    assumptionName,
    isAssignedToMe,
    isAssignedToOther,
    unitName,
    onClick,
}: TaskRowProps) {
    const visual = buildStateVisual(state.kind);
    const timeLabel = timeLabelOverride ?? formatTime(start_time, end_time);
    const showProgress =
        typeof progress === "number" &&
        (state.kind === "doing" ||
            state.kind === "blocked" ||
            (state.kind === "late" && state.inProgress));

    const typeIcon = kind === "receiving" ? "local_shipping" : "checklist";
    const ariaDisabled = isAssignedToOther === true;

    return (
        <button
            type="button"
            onClick={() => {
                if (ariaDisabled) return;
                onClick();
            }}
            disabled={ariaDisabled}
            className={`group w-full text-left rounded-lg border border-[#233f48] bg-[#1a2c32] hover:bg-[#1f363d] transition-colors border-l-4 ${visual.stripeCls} ${ariaDisabled ? "opacity-60 cursor-not-allowed hover:bg-[#1a2c32]" : ""}`}
        >
            <div className="flex items-stretch gap-3 px-3 py-2.5 sm:py-3">
                {/* Type icon */}
                <div className="shrink-0 self-center">
                    <span className={`material-symbols-outlined text-[20px] ${visual.iconCls}`} aria-hidden>
                        {typeIcon}
                    </span>
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                    {/* Linha 1: título + (mobile) time pill compacto */}
                    <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-white text-sm sm:text-[15px] font-semibold leading-tight truncate min-w-0">
                            {title}
                        </h3>
                        {isRequired && (
                            <span className="shrink-0 inline-flex items-center text-[9px] font-bold uppercase tracking-wider text-[#92bbc9] bg-[#16262c] border border-[#233f48] px-1.5 py-px rounded">
                                Obrig.
                            </span>
                        )}
                    </div>

                    {/* Linha 2: metadados (área · items · supplier · badges) */}
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-[#92bbc9] min-w-0 flex-wrap">
                        {kind === "receiving" ? (
                            <span className={`inline-flex items-center gap-1 font-medium px-1.5 py-px rounded border ${isReceivingOverdue ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-amber-300/90 bg-amber-500/5 border-amber-500/20"}`}>
                                Recebimento
                            </span>
                        ) : null}
                        {kind === "receiving" && supplier && (
                            <span
                                className="inline-flex items-center gap-1 font-bold text-[#13b6ec] bg-[#13b6ec]/10 border border-[#13b6ec]/30 px-1.5 py-px rounded truncate max-w-[60vw] sm:max-w-[240px]"
                                title={supplier}
                            >
                                <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                                <span className="truncate">{supplier}</span>
                            </span>
                        )}
                        {area && (
                            <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                                <span className="material-symbols-outlined text-[12px] opacity-70">place</span>
                                <span className="truncate">{area}</span>
                            </span>
                        )}
                        {typeof itemsCount === "number" && itemsCount > 0 && (
                            <>
                                <span className="text-[#325a67]">·</span>
                                <span className="tabular-nums">{itemsCount} {itemsCount === 1 ? "item" : "itens"}</span>
                            </>
                        )}
                        {kind !== "receiving" && supplier && (
                            <>
                                <span className="text-[#325a67]">·</span>
                                <span className="truncate max-w-[180px]">{supplier}</span>
                            </>
                        )}
                        {unitName && (
                            <>
                                <span className="text-[#325a67]">·</span>
                                <span className="truncate max-w-[120px]">{unitName}</span>
                            </>
                        )}
                        {visual.label && (
                            <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded border ${visual.labelCls}`}>
                                {visual.label}
                            </span>
                        )}
                    </div>

                    {/* Linha 3: progresso (opcional) */}
                    {showProgress && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-[#101d22] rounded-full h-1 overflow-hidden">
                                <div
                                    className={`${visual.progressCls} h-full rounded-full transition-all`}
                                    style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }}
                                />
                            </div>
                            <span className="text-[10px] font-bold text-[#92bbc9] tabular-nums shrink-0">{progress ?? 0}%</span>
                            {flaggedCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-400 shrink-0">
                                    <span className="material-symbols-outlined text-[11px]">warning</span>
                                    {flaggedCount}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Linha 4: responsável (só quando relevante) */}
                    {assumptionName && (
                        <div className="text-[11px] text-[#92bbc9] truncate">
                            <span className="material-symbols-outlined text-[11px] align-middle mr-0.5 opacity-70">person</span>
                            <span className={isAssignedToMe ? "text-[#13b6ec] font-semibold" : ""}>{assumptionName}{isAssignedToMe ? " (você)" : ""}</span>
                        </div>
                    )}
                </div>

                {/* Lado direito: time pill + chevron */}
                <div className="shrink-0 flex items-center gap-2 self-center">
                    {timeLabel && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-[#e0e0e0] bg-[#101d22] border border-[#233f48]/60 px-2 py-1 rounded">
                            <span className="material-symbols-outlined text-[12px] text-[#13b6ec]">schedule</span>
                            <span className="tabular-nums">{timeLabel}</span>
                        </span>
                    )}
                    <span className="material-symbols-outlined text-[18px] text-[#5a8a99] group-hover:text-[#92bbc9] transition-colors">
                        chevron_right
                    </span>
                </div>
            </div>

            {/* Time pill mobile (abaixo do body) — fica fora do flex principal para não comprimir */}
            {timeLabel && (
                <div className="sm:hidden flex items-center justify-between gap-2 px-3 pb-2 -mt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#e0e0e0] bg-[#101d22] border border-[#233f48]/60 px-1.5 py-0.5 rounded">
                        <span className="material-symbols-outlined text-[11px] text-[#13b6ec]">schedule</span>
                        <span className="tabular-nums">{timeLabel}</span>
                    </span>
                    {assumptionName == null && isAssignedToOther && (
                        <span className="text-[10px] text-[#325a67] font-semibold">Atribuída a outro</span>
                    )}
                </div>
            )}
        </button>
    );
}
