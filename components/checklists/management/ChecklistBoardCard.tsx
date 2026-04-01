"use client";

import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

const SHIFT_LABELS: Record<string, string> = {
    morning: "Manhã",
    afternoon: "Tarde",
    evening: "Noite",
    any: "Qualquer",
};

interface ChecklistBoardCardProps {
    checklist: ExtendedChecklist;
    onSelect: () => void;
    onStatusToggle: (active: boolean) => void;
}

export function ChecklistBoardCard({
    checklist,
    onSelect,
}: ChecklistBoardCardProps) {
    const taskCount = checklist.tasks?.length ?? 0;
    const isExecuting = Boolean(checklist.assumed_by_name);
    const responsibleName = checklist.assumed_by_name || checklist.responsible?.name;

    return (
        <div
            onClick={onSelect}
            className="bg-[#0a1215] border border-[#233f48] hover:border-[#325a67] rounded-xl p-3 cursor-pointer select-none transition-shadow"
        >
            {/* Title + active badge */}
            <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-white text-sm leading-snug line-clamp-2">
                    {checklist.name}
                </p>
                <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        checklist.active
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                    }`}
                >
                    {checklist.active ? "Ativo" : "Inativo"}
                </span>
            </div>

            {/* Área */}
            <div className="flex items-center gap-1.5 mt-1.5">
                {checklist.area ? (
                    <>
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: checklist.area.color || "#325a67" }}
                        />
                        <span className="text-[#92bbc9] text-xs">{checklist.area.name}</span>
                    </>
                ) : (
                    <span className="text-[#325a67] text-xs italic">Qualquer área</span>
                )}
            </div>

            {/* Responsável / Executando */}
            {responsibleName && (
                <div className="flex items-center gap-1.5 mt-2">
                    <span className={`material-symbols-outlined text-[14px] shrink-0 ${isExecuting ? 'text-[#13b6ec]' : 'text-[#5a8a99]'}`}>person</span>
                    <span className="text-[#92bbc9] text-sm truncate">{responsibleName}</span>
                    {isExecuting && (
                        <span className="shrink-0 text-[9px] font-bold text-[#13b6ec] bg-[#13b6ec]/10 border border-[#13b6ec]/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                            Executando
                        </span>
                    )}
                </div>
            )}

            {/* Footer: task count + turno + horário */}
            <div className="flex items-center justify-between mt-2">
                <span className="flex items-center gap-1 text-[#92bbc9] text-xs">
                    <span className="material-symbols-outlined text-[14px]">checklist</span>
                    {taskCount} {taskCount === 1 ? "tarefa" : "tarefas"}
                </span>
                <div className="flex items-center gap-2">
                    {checklist.start_time && (
                        <span className="text-[#5a8a99] text-[10px]">
                            {checklist.start_time}
                            {checklist.end_time ? ` - ${checklist.end_time}` : ""}
                        </span>
                    )}
                    <span className="text-[#325a67] text-[10px] font-bold">
                        {SHIFT_LABELS[checklist.shift] ?? checklist.shift}
                    </span>
                </div>
            </div>
        </div>
    );
}
