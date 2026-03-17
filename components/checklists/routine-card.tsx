"use client";

import { ChecklistPriorityLevel, getChecklistPriority } from "@/lib/utils/checklist-priority";

export type RoutineCardVariant = "admin" | "collaborator_todo" | "collaborator_doing";

export interface RoutineCardProps {
    variant: RoutineCardVariant;
    title: string;
    description?: string;
    
    // Time & Priority
    start_time?: string | null;
    end_time?: string | null;
    currentMinutes?: number;
    
    // Status visual
    isActiveStatus?: boolean; // For Admin Active/Draft/Archived string
    adminStatusString?: string;
    
    // Informações da Rotina
    itemsCount: number;
    shift?: string;
    sectorName?: string;
    sectorColor?: string;
    routineType?: string; // opening, closing, receiving
    isRequired?: boolean;
    
    // Collaborator specific
    progress?: number;
    flaggedCount?: number;
    assumptionName?: string;
    isAssignedToOther?: boolean;
    
    // Events & States
    isSelected?: boolean;
    onClick: () => void;
}

export function RoutineCard({
    variant,
    title,
    description,
    start_time,
    end_time,
    currentMinutes = 0,
    isActiveStatus = true,
    adminStatusString = 'active',
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
    isSelected = false,
    onClick
}: RoutineCardProps) {

    // --- Time and Status Calculation ---
    const priority = getChecklistPriority({ 
        start_time: start_time || undefined, 
        end_time: end_time || undefined 
    }, currentMinutes);
    const hasTime = start_time || end_time;

    let timeLabel = "Sem horário";
    if (start_time && end_time) {
        timeLabel = `${start_time} - ${end_time}`;
    } else if (start_time) {
        timeLabel = `A partir de ${start_time}`;
    } else if (end_time) {
        timeLabel = `Até ${end_time}`;
    }

    const isOverdue = priority === ChecklistPriorityLevel.LATE;
    const isFuture = priority === ChecklistPriorityLevel.FUTURE;
    
    // Determine dynamic borders for Collaborator TODO
    let cardBorder = "";
    if (variant === "collaborator_todo") {
        if (isOverdue) cardBorder = "border-l-4 border-red-500 border-red-500/20";
        else if (isFuture) cardBorder = "border-l-4 border-[#233f48] opacity-80";
        else if (isRequired) cardBorder = "border-l-4 border-[#13b6ec] border-[#13b6ec]/30";
        else cardBorder = "border-l-4 border-[#233f48]";
    } else if (variant === "collaborator_doing") {
        cardBorder = "border border-amber-500/20";
    }

    let cardBgClass = "bg-[#16262c] hover:bg-[#1a2c32] border-[#233f48]";
    if (variant === "admin") {
        cardBgClass = isSelected
            ? "bg-[#13b6ec]/10 border-[#13b6ec]/40 shadow-[0_4px_20px_0_rgba(19,182,236,0.1)]"
            : "bg-[#16262c] border-[#233f48] hover:border-[#325a67] hover:bg-[#1a2c32]";
    } else {
        cardBgClass = `bg-[#1a2c32] shadow-sm transition-all ${!isAssignedToOther ? 'cursor-pointer hover:bg-[#1f363d]' : 'opacity-75'} ${cardBorder}`;
    }

    // --- Render Helpers ---
    const getAdminStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Ativo</span>;
            case 'archived': return <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Arquivado</span>;
            default: return <span className="bg-gray-500/20 text-gray-400 border border-gray-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Rascunho</span>;
        }
    };

    const getTypeBadge = (type?: string) => {
        switch (type) {
            case 'opening': return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"><span className="text-[12px]">🌅</span> Abertura</span>;
            case 'closing': return <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"><span className="text-[12px]">🌙</span> Fechamento</span>;
            case 'receiving': return <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"><span className="text-[12px]">📦</span> Recebimento</span>;
            default: return null;
        }
    };

    const getShiftLabel = (s: string) => {
        switch (s) {
            case 'morning': return 'Manhã';
            case 'afternoon': return 'Tarde';
            case 'evening': return 'Noite';
            default: return 'Qualquer turno';
        }
    };

    const renderPriorityBadge = () => {
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

    return (
        <button
            onClick={() => {
                if (!isAssignedToOther || variant === "admin") onClick();
            }}
            className={`w-full text-left p-4 rounded-xl border transition-all duration-200 flex flex-col gap-2 ${cardBgClass}`}
        >
            <div className="flex justify-between items-start gap-3 w-full">
                <div>
                    <h3 className={`font-bold text-base line-clamp-1 pr-2 ${variant === 'admin' ? (isSelected ? "text-white" : "text-white/90") : "text-white leading-snug"}`}>
                        {title}
                    </h3>
                    
                    {variant !== 'admin' && (
                        <p className="text-[#92bbc9] text-xs mt-1">{itemsCount} {itemsCount === 1 ? 'item' : 'itens'}</p>
                    )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {variant === 'admin' ? (
                        <div className="shrink-0 mt-0.5">{getAdminStatusBadge(adminStatusString)}</div>
                    ) : variant === 'collaborator_todo' ? (
                        <>
                            {isRequired && (
                                <span className="bg-[#13b6ec]/10 text-[#13b6ec] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">bolt</span> Obrigatório
                                </span>
                            )}
                        </>
                    ) : variant === 'collaborator_doing' ? (
                        <>
                            {flaggedCount > 0 && (
                                <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold bg-red-500/10 px-2 py-1 rounded">
                                    <span className="material-symbols-outlined text-[12px]">warning</span> Impedimento
                                </span>
                            )}
                        </>
                    ) : null}
                </div>
            </div>

            {/* Admin Only Description */}
            {variant === 'admin' && description && (
                <p className="text-[#92bbc9] text-sm line-clamp-2 leading-relaxed mb-2">
                    {description}
                </p>
            )}

            {/* Time & Priority Unified Box */}
            <div className="flex items-center gap-2 my-1 bg-[#101d22] p-2 rounded-lg border border-[#233f48]/50 w-full">
                <span className="material-symbols-outlined text-[#13b6ec] text-[16px]">schedule</span>
                <span className="text-xs font-bold text-[#e0e0e0]">{timeLabel}</span>
                <div className="ml-auto">
                    {renderPriorityBadge()}
                </div>
            </div>

            {/* Admin Footer */}
            {variant === 'admin' && (
                <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-2 pt-3 border-t border-[#233f48]/50 w-full">
                    {shift && (
                        <div className="flex items-center gap-1.5 text-[#325a67]">
                            <span className="material-symbols-outlined text-[16px]">schedule</span>
                            <span className="text-xs font-medium text-[#92bbc9]">{getShiftLabel(shift)}</span>
                        </div>
                    )}
                    {sectorName && (
                        <div className="flex items-center gap-1.5 bg-[#1a2c32] px-2 py-0.5 rounded-md border border-[#233f48]">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sectorColor || '#92bbc9' }} />
                            <span className="text-xs font-bold text-white truncate max-w-[100px]">{sectorName}</span>
                        </div>
                    )}
                    {getTypeBadge(routineType)}
                    <div className="flex items-center gap-1.5 text-[#325a67] ml-auto">
                        <span className="material-symbols-outlined text-[16px]">task_alt</span>
                        <span className="text-xs font-bold text-[#13b6ec]">{itemsCount}</span>
                    </div>
                </div>
            )}

            {/* Collaborator TODO Footer */}
            {variant === 'collaborator_todo' && (
                <div className="flex items-center gap-3 mt-1 pt-2 border-t border-[#233f48]/50 text-sm font-bold text-[#92bbc9] w-full">
                    {isAssignedToOther ? (
                        <span className="text-[#325a67]">Atribuída a outro funcionário</span>
                    ) : assumptionName ? (
                        <span className="text-[#13b6ec]/80 flex items-center gap-1 text-xs">
                            <span className="material-symbols-outlined text-[14px]">person</span>
                            Assumida por {assumptionName}
                        </span>
                    ) : (
                        <span className="text-[#13b6ec] ml-auto flex items-center gap-1">Ver detalhes <span className="material-symbols-outlined text-[16px]">arrow_right_alt</span></span>
                    )}
                </div>
            )}

            {/* Collaborator DOING Footer */}
            {variant === 'collaborator_doing' && (
                <div className="flex flex-col gap-3 w-full">
                    {assumptionName && (
                        <p className="text-[#92bbc9] text-xs flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-[#13b6ec]">person</span>
                            Em execução por: <span className="text-white font-medium ml-0.5">{assumptionName}</span>
                        </p>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 w-full bg-[#101d22] rounded-full h-2.5 overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                        </div>
                        <span className="text-amber-400 text-xs font-bold shrink-0">{progress}%</span>
                    </div>
                    <div className="flex items-center mt-1 text-sm font-bold w-full">
                        <span className="text-amber-400 ml-auto flex items-center gap-1">Continuar <span className="material-symbols-outlined text-[16px]">arrow_right_alt</span></span>
                    </div>
                </div>
            )}
        </button>
    );
}
