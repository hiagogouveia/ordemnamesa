"use client";

import { ChecklistPriorityLevel, getChecklistPriority } from "@/lib/utils/checklist-priority";
import { getRoutineState, RoutineStateInfo, RoutineStateKind } from "@/lib/utils/routine-state";
import { UnitBadge } from "@/components/ui/unit-badge";

export type RoutineCardVariant = "admin" | "collaborator_todo" | "collaborator_doing";

export interface RoutineCardProps {
    variant: RoutineCardVariant;
    title: string;
    description?: string;

    // Time & Priority
    start_time?: string | null;
    end_time?: string | null;
    currentMinutes?: number;

    // Status visual (admin)
    isActiveStatus?: boolean;
    adminStatusString?: string;

    // Informações da Rotina
    itemsCount: number;
    shift?: string;
    sectorName?: string;
    sectorColor?: string;
    routineType?: string;
    isRequired?: boolean;

    // Collaborator specific
    area?: string;
    progress?: number;
    flaggedCount?: number;
    assumptionName?: string;
    isAssignedToOther?: boolean;
    isAssignedToMe?: boolean;
    /** Estado operacional consolidado (colaborador). Se ausente, é inferido por horário. */
    state?: RoutineStateInfo;

    // Visão Global
    unitName?: string;

    // Events & States
    isSelected?: boolean;
    isPreview?: boolean;
    onClick: () => void;

    // Drag & Drop
    containerRef?: React.Ref<HTMLButtonElement>;
    containerStyle?: React.CSSProperties;
    dragHandleProps?: Record<string, any>;
}

interface StateVisual {
    label: string;
    icon: string | null;
    borderCls: string;
    badgeCls: string;
    progressCls: string;
    ctaLabel: string;
    ctaCls: string;
}

function buildStateVisual(kind: RoutineStateKind, start_time?: string | null): StateVisual {
    switch (kind) {
        case "blocked":
            return {
                label: "Com impedimento",
                icon: "block",
                borderCls: "border-l-4 border-l-amber-500",
                badgeCls: "bg-amber-500/15 text-amber-400 border-amber-500/40",
                progressCls: "bg-amber-400",
                ctaLabel: "Revisar impedimento",
                ctaCls: "text-amber-400",
            };
        case "late":
            return {
                label: "Atrasada",
                icon: "warning",
                borderCls: "border-l-4 border-l-red-500",
                badgeCls: "bg-red-500/10 text-red-400 border-red-500/40",
                progressCls: "bg-red-400",
                ctaLabel: "Continuar",
                ctaCls: "text-red-400",
            };
        case "doing":
            return {
                label: "Em execução",
                icon: "play_circle",
                borderCls: "border-l-4 border-l-[#13b6ec]",
                badgeCls: "bg-[#13b6ec]/10 text-[#13b6ec] border-[#13b6ec]/40",
                progressCls: "bg-[#13b6ec]",
                ctaLabel: "Continuar",
                ctaCls: "text-[#13b6ec]",
            };
        case "future":
            return {
                label: start_time ? `Começa às ${start_time}` : "Futura",
                icon: "schedule",
                borderCls: "border-l-4 border-l-[#325a67]",
                badgeCls: "bg-[#1a2c32] text-[#92bbc9] border-[#325a67]",
                progressCls: "bg-[#92bbc9]",
                ctaLabel: "Ver detalhes",
                ctaCls: "text-[#92bbc9]",
            };
        case "available":
        default:
            return {
                label: "Disponível",
                icon: null,
                borderCls: "border-l-4 border-l-[#325a67]",
                badgeCls: "bg-[#1a2c32] text-[#92bbc9] border-[#325a67]",
                progressCls: "bg-[#92bbc9]",
                ctaLabel: "Ver detalhes",
                ctaCls: "text-[#13b6ec]",
            };
    }
}

export function RoutineCard({
    variant,
    title,
    description,
    start_time,
    end_time,
    currentMinutes = 0,
    isActiveStatus = true,
    adminStatusString = "active",
    itemsCount,
    shift,
    sectorName,
    sectorColor,
    routineType,
    isRequired,
    progress = 0,
    flaggedCount = 0,
    assumptionName,
    isAssignedToOther = false,
    isAssignedToMe = false,
    area,
    unitName,
    state,
    isSelected = false,
    isPreview = false,
    onClick,
    containerRef,
    containerStyle,
    dragHandleProps,
}: RoutineCardProps) {
    const hasTime = start_time || end_time;

    let timeLabel = "Sem horário";
    if (start_time && end_time) timeLabel = `${start_time} - ${end_time}`;
    else if (start_time) timeLabel = `A partir de ${start_time}`;
    else if (end_time) timeLabel = `Até ${end_time}`;

    const getShiftLabel = (s: string) => {
        switch (s) {
            case "morning": return "Manhã";
            case "afternoon": return "Tarde";
            case "evening": return "Noite";
            default: return "Qualquer turno";
        }
    };

    const getTypeBadge = (type?: string) => {
        switch (type) {
            case "opening": return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"><span className="text-[12px]">🌅</span> Abertura</span>;
            case "closing": return <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"><span className="text-[12px]">🌙</span> Fechamento</span>;
            case "receiving": return <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"><span className="text-[12px]">📦</span> Recebimento</span>;
            default: return null;
        }
    };

    // ---------------------- ADMIN (legado, inalterado) ----------------------
    if (variant === "admin") {
        const priority = getChecklistPriority({
            start_time: start_time || undefined,
            end_time: end_time || undefined,
        }, currentMinutes);

        const renderLegacyPriorityBadge = () => {
            if (!hasTime) {
                return <span className="text-[10px] font-bold text-[#92bbc9] bg-[#16262c] px-2 py-0.5 rounded-full border border-[#233f48] uppercase tracking-wide">Sem Horário</span>;
            }
            switch (priority) {
                case ChecklistPriorityLevel.ACTIVE:
                    return <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> Ativa</span>;
                case ChecklistPriorityLevel.FUTURE:
                    return <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 uppercase tracking-wide flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">lock_clock</span> Futura</span>;
                case ChecklistPriorityLevel.LATE:
                    return <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 uppercase tracking-wide flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">warning</span> Atrasada</span>;
                default:
                    return null;
            }
        };

        const getAdminStatusBadge = (status: string) => {
            switch (status) {
                case "active": return <span className="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Ativo</span>;
                case "archived": return <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Arquivado</span>;
                default: return <span className="bg-gray-500/20 text-gray-400 border border-gray-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Rascunho</span>;
            }
        };

        const adminBgCls = isSelected
            ? "bg-[#13b6ec]/10 border-[#13b6ec]/40 shadow-[0_4px_20px_0_rgba(19,182,236,0.1)]"
            : "bg-[#16262c] border-[#233f48] hover:border-[#325a67] hover:bg-[#1a2c32]";

        return (
            <button
                ref={containerRef}
                style={containerStyle}
                onClick={onClick}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 flex flex-col gap-2 ${adminBgCls} ${dragHandleProps ? "group/card" : ""}`}
            >
                <div className="flex justify-between items-start gap-3 w-full">
                    <div className="flex items-start gap-2 max-w-full overflow-hidden">
                        {dragHandleProps && (
                            <div
                                {...dragHandleProps}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 -ml-2 -mt-1 p-1 flex items-center justify-center rounded hover:bg-[#101d22] cursor-grab active:cursor-grabbing text-[#325a67] group-hover/card:text-[#92bbc9] transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                            </div>
                        )}
                        <div className="min-w-0">
                            <h3 className={`font-bold text-base truncate pr-2 ${isSelected ? "text-white" : "text-white/90"}`}>
                                {title}
                            </h3>
                        </div>
                    </div>
                    <div className="shrink-0 mt-0.5">{getAdminStatusBadge(adminStatusString)}</div>
                </div>

                {description && (
                    <p className="text-[#92bbc9] text-sm line-clamp-2 leading-relaxed mb-2">
                        {description}
                    </p>
                )}

                <div className="flex items-center gap-2 my-1 bg-[#101d22] p-2 rounded-lg border border-[#233f48]/50 w-full">
                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px]">schedule</span>
                    <span className="text-xs font-bold text-[#e0e0e0]">{timeLabel}</span>
                    <div className="ml-auto">{renderLegacyPriorityBadge()}</div>
                </div>

                <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-2 pt-3 border-t border-[#233f48]/50 w-full">
                    {shift && (
                        <div className="flex items-center gap-1.5 text-[#325a67]">
                            <span className="material-symbols-outlined text-[16px]">schedule</span>
                            <span className="text-xs font-medium text-[#92bbc9]">{getShiftLabel(shift)}</span>
                        </div>
                    )}
                    {sectorName && (
                        <div className="flex items-center gap-1.5 bg-[#1a2c32] px-2 py-0.5 rounded-md border border-[#233f48]">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sectorColor || "#92bbc9" }} />
                            <span className="text-xs font-bold text-white truncate max-w-[100px]">{sectorName}</span>
                        </div>
                    )}
                    {getTypeBadge(routineType)}
                    <div className="flex items-center gap-1.5 text-[#325a67] ml-auto">
                        <span className="material-symbols-outlined text-[16px]">task_alt</span>
                        <span className="text-xs font-bold text-[#13b6ec]">{itemsCount}</span>
                    </div>
                </div>
            </button>
        );
    }

    // ---------------------- COLABORADOR (novo design unificado) ----------------------
    // Fallback: infere estado por horário quando não é fornecido (ex: modo preview).
    const resolvedState: RoutineStateInfo = state ?? getRoutineState({
        start_time: start_time ?? null,
        end_time: end_time ?? null,
        currentMinutes,
        hasBlockedTask: false,
        hasInProgressExecution: variant === "collaborator_doing",
    });

    const visual = buildStateVisual(resolvedState.kind, start_time ?? null);
    const showProgress = !isPreview && (
        resolvedState.kind === "doing" ||
        resolvedState.kind === "blocked" ||
        (resolvedState.kind === "late" && resolvedState.inProgress)
    );
    const showLateInProgressHint = resolvedState.kind === "late" && resolvedState.inProgress;
    const areaLabel = !area || area === "Qualquer Área" ? "Geral" : area;

    const cardBaseCls = "bg-[#1a2c32] border border-[#233f48] shadow-sm transition-all";
    const interactionCls = isPreview
        ? "cursor-default"
        : isAssignedToOther
            ? "opacity-75 cursor-not-allowed"
            : "cursor-pointer hover:bg-[#1f363d]";

    return (
        <button
            ref={containerRef}
            style={containerStyle}
            onClick={() => {
                if (isPreview) return;
                if (isAssignedToOther) return;
                onClick();
            }}
            className={`w-full text-left p-4 rounded-xl ${cardBaseCls} ${visual.borderCls} ${interactionCls} flex flex-col gap-3`}
        >
            {/* 1. TOPO: badge de estado + obrigatório */}
            <div className="flex justify-between items-center gap-2 w-full">
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-md border ${visual.badgeCls}`}>
                    {visual.icon && (
                        <span className="material-symbols-outlined text-[14px]">{visual.icon}</span>
                    )}
                    {visual.label}
                    {showLateInProgressHint && (
                        <span className="ml-1 normal-case font-medium text-red-300/80 text-[10px]">· em execução</span>
                    )}
                </span>

                {isRequired && (
                    <span className="text-[10px] font-bold text-[#92bbc9] bg-[#16262c] border border-[#233f48] px-2 py-0.5 rounded-md uppercase tracking-wide flex items-center gap-1 shrink-0">
                        <span className="material-symbols-outlined text-[12px]">bolt</span>
                        Obrigatório
                    </span>
                )}
            </div>

            {/* 2. TÍTULO + 3. METADATA */}
            <div className="flex flex-col gap-1 min-w-0">
                <h3 className="font-bold text-base text-white leading-snug truncate">
                    {title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-[#92bbc9] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] opacity-70">location_on</span>
                        {areaLabel}
                    </span>
                    <span className="text-[#325a67]">·</span>
                    <span>{itemsCount} {itemsCount === 1 ? "item" : "itens"}</span>
                </div>
                {unitName && <UnitBadge name={unitName} />}
            </div>

            {/* 4. HORÁRIO */}
            <div className="flex items-center gap-2 bg-[#101d22] px-2.5 py-1.5 rounded-lg border border-[#233f48]/50 w-full">
                <span className="material-symbols-outlined text-[#13b6ec] text-[16px]">schedule</span>
                <span className="text-xs font-bold text-[#e0e0e0]">{timeLabel}</span>
            </div>

            {/* 5. PROGRESSO (só em execução / impedimento / atrasada+execução) */}
            {showProgress && (
                <div className="flex items-center gap-2 w-full">
                    <div className="flex-1 bg-[#101d22] rounded-full h-1.5 overflow-hidden">
                        <div
                            className={`${visual.progressCls} h-full rounded-full transition-all`}
                            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                        />
                    </div>
                    <span className="text-[11px] font-bold text-[#92bbc9] shrink-0 tabular-nums">{progress}%</span>
                    {flaggedCount > 0 && (
                        <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">
                            <span className="material-symbols-outlined text-[12px]">warning</span>
                            {flaggedCount}
                        </span>
                    )}
                </div>
            )}

            {/* 6. RESPONSÁVEL (secundário) + CTA */}
            <div className="flex items-center justify-between gap-2 w-full pt-2 border-t border-[#233f48]/50">
                <div className="min-w-0 flex-1">
                    {assumptionName ? (
                        <span className={`inline-flex items-center gap-1 text-xs truncate ${isAssignedToMe ? "text-[#13b6ec] font-bold" : "text-[#92bbc9]"}`}>
                            <span className="material-symbols-outlined text-[14px] opacity-80">person</span>
                            <span className="truncate">
                                {resolvedState.kind === "doing" || (resolvedState.kind === "late" && resolvedState.inProgress) || resolvedState.kind === "blocked"
                                    ? `Em execução por ${assumptionName}`
                                    : `Assumida por ${assumptionName}`}
                                {isAssignedToMe && <span className="ml-1">(você)</span>}
                            </span>
                        </span>
                    ) : (
                        <span className="text-xs text-[#325a67]">Ninguém iniciou</span>
                    )}
                </div>

                {!isPreview && (
                    isAssignedToOther ? (
                        <span className="text-xs text-[#325a67] font-bold shrink-0">Atribuída a outro</span>
                    ) : (
                        <span className={`text-xs font-bold flex items-center gap-1 shrink-0 ${visual.ctaCls}`}>
                            {visual.ctaLabel}
                            <span className="material-symbols-outlined text-[16px]">arrow_right_alt</span>
                        </span>
                    )
                )}
            </div>
        </button>
    );
}
