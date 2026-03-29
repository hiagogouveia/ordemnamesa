"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

interface ChecklistBoardCardProps {
    checklist: ExtendedChecklist & { position: number };
    shift: "morning" | "afternoon" | "evening";
    editMode: boolean;
    onSelect: () => void;
    onStatusToggle: (active: boolean) => void;
}

export function ChecklistBoardCard({
    checklist,
    shift,
    editMode,
    onSelect,
    onStatusToggle,
}: ChecklistBoardCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: `${checklist.id}-${shift}`,
        data: { shift, checklist_id: checklist.id },
        disabled: !editMode,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    const taskCount = checklist.tasks?.length ?? 0;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-[#0a1215] border rounded-xl p-3 select-none transition-shadow ${
                isDragging
                    ? "border-[#13b6ec]/50 shadow-lg shadow-[#13b6ec]/10"
                    : "border-[#233f48] hover:border-[#325a67]"
            }`}
        >
            <div className="flex items-start gap-2">
                {/* Drag handle (only in edit mode) */}
                {editMode && (
                    <button
                        {...attributes}
                        {...listeners}
                        className="mt-0.5 shrink-0 text-[#325a67] hover:text-[#92bbc9] cursor-grab active:cursor-grabbing"
                    >
                        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                    </button>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0" onClick={editMode ? undefined : onSelect}>
                    <div className={`flex items-start justify-between gap-2 ${!editMode ? "cursor-pointer" : ""}`}>
                        <p className="font-semibold text-white text-sm leading-snug line-clamp-2">
                            {checklist.name}
                        </p>
                        {/* Status badge */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (editMode) onStatusToggle(!checklist.active);
                            }}
                            disabled={!editMode}
                            className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                                checklist.active
                                    ? editMode
                                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer"
                                        : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                    : editMode
                                        ? "bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30 cursor-pointer"
                                        : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            }`}
                        >
                            {checklist.active ? "Ativo" : "Inativo"}
                        </button>
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

                    {/* Footer: task count + position */}
                    <div className="flex items-center justify-between mt-2">
                        <span className="flex items-center gap-1 text-[#92bbc9] text-xs">
                            <span className="material-symbols-outlined text-[14px]">checklist</span>
                            {taskCount} {taskCount === 1 ? "tarefa" : "tarefas"}
                        </span>
                        {editMode && checklist.position < 9999 && (
                            <span className="text-[#325a67] text-[10px] font-bold">#{checklist.position + 1}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
