"use client";

import { Checklist } from "@/lib/types";
import { getChecklistPriority, ChecklistPriorityLevel } from "@/lib/utils/checklist-priority";

// Extended interface with UI-specific properties that we added
export interface ExtendedChecklist extends Checklist {
    category?: string;
}

interface ChecklistCardProps {
    checklist: ExtendedChecklist;
    isSelected: boolean;
    onClick: () => void;
    currentMinutes?: number;
}

export function ChecklistCard({ checklist, isSelected, onClick, currentMinutes = 0 }: ChecklistCardProps) {
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Ativo</span>;
            case 'archived': return <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Arquivado</span>;
            default: return <span className="bg-gray-500/20 text-gray-400 border border-gray-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Rascunho</span>;
        }
    };

    const getShiftLabel = (shift: string) => {
        switch (shift) {
            case 'morning': return 'Manhã';
            case 'afternoon': return 'Tarde';
            case 'evening': return 'Noite';
            default: return 'Qualquer turno';
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

    const priority = getChecklistPriority(checklist, currentMinutes);
    const hasTime = checklist.start_time || checklist.end_time;
    
    let timeLabel = "Sem horário";
    if (checklist.start_time && checklist.end_time) {
        timeLabel = `${checklist.start_time} - ${checklist.end_time}`;
    } else if (checklist.start_time) {
        timeLabel = `A partir de ${checklist.start_time}`;
    } else if (checklist.end_time) {
        timeLabel = `Até ${checklist.end_time}`;
    }

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
            onClick={onClick}
            className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${isSelected
                ? "bg-[#13b6ec]/10 border-[#13b6ec]/40 shadow-[0_4px_20px_0_rgba(19,182,236,0.1)]"
                : "bg-[#16262c] border-[#233f48] hover:border-[#325a67] hover:bg-[#1a2c32]"
                }`}
        >
            <div className="flex justify-between items-start mb-2">
                <h3 className={`font-bold text-base line-clamp-1 pr-2 ${isSelected ? "text-white" : "text-white/90"}`}>
                    {checklist.name}
                </h3>
                <div className="shrink-0 mt-0.5">{getStatusBadge(checklist.status)}</div>
            </div>

            {checklist.description && (
                <p className="text-[#92bbc9] text-sm line-clamp-2 leading-relaxed mb-4">
                    {checklist.description}
                </p>
            )}

            <div className="flex items-center gap-2 mb-4 bg-[#101d22] p-2 rounded-lg border border-[#233f48]/50">
                <span className="material-symbols-outlined text-[#13b6ec] text-[16px]">schedule</span>
                <span className="text-xs font-bold text-[#e0e0e0]">{timeLabel}</span>
                <div className="ml-auto">
                    {renderPriorityBadge()}
                </div>
            </div>

            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-auto pt-3 border-t border-[#233f48]/50">
                <div className="flex items-center gap-1.5 text-[#325a67]">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span className="text-xs font-medium text-[#92bbc9]">{getShiftLabel(checklist.shift)}</span>
                </div>

                {checklist.category ? (
                    <div className="flex items-center gap-1.5 text-[#325a67]">
                        <span className="material-symbols-outlined text-[16px]">person</span>
                        <span className="text-xs font-medium text-[#92bbc9] truncate">{checklist.category}</span>
                    </div>
                ) : checklist.roles ? (
                    <div className="flex items-center gap-1.5 bg-[#1a2c32] px-2 py-0.5 rounded-md border border-[#233f48]">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: checklist.roles.color || '#92bbc9' }} />
                        <span className="text-xs font-bold text-white truncate max-w-[100px]">{checklist.roles.name}</span>
                    </div>
                ) : null}

                {getTypeBadge(checklist.checklist_type)}

                <div className="flex items-center gap-1.5 text-[#325a67] ml-auto">
                    <span className="material-symbols-outlined text-[16px]">task_alt</span>
                    <span className="text-xs font-bold text-[#13b6ec]">{checklist.tasks?.length || 0}</span>
                </div>
            </div>
        </button>
    );
}
