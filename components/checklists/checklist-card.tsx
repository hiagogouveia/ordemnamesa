"use client";

import { Checklist } from "@/lib/types";

// Extended interface with UI-specific properties that we added
export interface ExtendedChecklist extends Checklist {
    category?: string;
}

interface ChecklistCardProps {
    checklist: ExtendedChecklist;
    isSelected: boolean;
    onClick: () => void;
}

export function ChecklistCard({ checklist, isSelected, onClick }: ChecklistCardProps) {
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

            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-auto pt-3 border-t border-[#233f48]/50">
                <div className="flex items-center gap-1.5 text-[#325a67]">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span className="text-xs font-medium text-[#92bbc9]">{getShiftLabel(checklist.shift)}</span>
                </div>

                {checklist.category && (
                    <div className="flex items-center gap-1.5 text-[#325a67]">
                        <span className="material-symbols-outlined text-[16px]">person</span>
                        <span className="text-xs font-medium text-[#92bbc9] truncate">{checklist.category}</span>
                    </div>
                )}

                <div className="flex items-center gap-1.5 text-[#325a67] ml-auto">
                    <span className="material-symbols-outlined text-[16px]">task_alt</span>
                    <span className="text-xs font-bold text-[#13b6ec]">{checklist.tasks?.length || 0}</span>
                </div>
            </div>
        </button>
    );
}
