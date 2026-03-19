"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChecklistTask } from "@/lib/types";
import { EquipeMember } from "@/lib/hooks/use-equipe";

interface TaskItemProps {
    task: Partial<ChecklistTask> & { tempId: string };
    equipe: EquipeMember[];
    onUpdate: (id: string, updates: Partial<ChecklistTask>) => void;
    onRemove: (id: string) => void;
    onEnter?: () => void;
    setInputRef?: (el: HTMLInputElement | null) => void;
    disableReorder?: boolean;
}

export function TaskItem({ task, equipe, onUpdate, onRemove, onEnter, setInputRef, disableReorder = false }: TaskItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.tempId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-start gap-3 p-4 bg-[#16262c] border rounded-xl transition-colors ${isDragging ? "border-[#13b6ec] shadow-lg shadow-[#13b6ec]/10 opacity-80" : "border-[#233f48] hover:border-[#325a67]"
                }`}
        >
            {!disableReorder && (
                <div
                    {...attributes}
                    {...listeners}
                    className="mt-1 flex items-center justify-center p-1 rounded hover:bg-[#1a2c32] cursor-grab active:cursor-grabbing text-[#325a67] group-hover:text-[#92bbc9] transition-colors"
                >
                    <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
                </div>
            )}

            <div className="flex-1 space-y-3">
                <div>
                    <input
                        ref={setInputRef}
                        type="text"
                        value={task.title || ""}
                        onChange={(e) => onUpdate(task.tempId, { title: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
                        placeholder="Título da tarefa..."
                        className="w-full bg-transparent border-none outline-none text-white font-bold placeholder:text-[#325a67] placeholder:font-normal focus:ring-0"
                    />
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer group/toggle">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${task.is_critical
                            ? "bg-amber-500 border-amber-500 text-[#111e22]"
                            : "bg-[#101d22] border-[#325a67] group-hover/toggle:border-amber-500/50"
                            }`}>
                            {task.is_critical && <span className="material-symbols-outlined text-[14px]">check</span>}
                        </div>
                        <span className="text-xs text-[#92bbc9]">Crítica</span>
                        <input
                            type="checkbox"
                            checked={!!task.is_critical}
                            onChange={(e) => onUpdate(task.tempId, { is_critical: e.target.checked })}
                            className="hidden"
                        />
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer group/toggle">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${task.requires_photo
                            ? "bg-[#13b6ec] border-[#13b6ec] text-[#111e22]"
                            : "bg-[#101d22] border-[#325a67] group-hover/toggle:border-[#13b6ec]/50"
                            }`}>
                            {task.requires_photo && <span className="material-symbols-outlined text-[14px]">check</span>}
                        </div>
                        <span className="text-xs text-[#92bbc9]">Exigir foto</span>
                        <input
                            type="checkbox"
                            checked={!!task.requires_photo}
                            onChange={(e) => onUpdate(task.tempId, { requires_photo: e.target.checked })}
                            className="hidden"
                        />
                    </label>

                    <div className="ml-auto w-36">
                        <select
                            value={task.assigned_to_user_id || ""}
                            onChange={(e) => onUpdate(task.tempId, { assigned_to_user_id: e.target.value || undefined })}
                            className="w-full bg-[#101d22] border border-[#325a67] text-[#92bbc9] text-xs rounded px-2 py-1 outline-none focus:border-[#13b6ec]"
                        >
                            <option value="">Qualquer pessoa</option>
                            {equipe.map(member => (
                                <option key={member.id} value={member.user_id}>{member.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <button
                onClick={() => onRemove(task.tempId)}
                className="p-1.5 text-[#325a67] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
            >
                <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>
    );
}
