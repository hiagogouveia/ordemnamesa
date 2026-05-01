"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChecklistTask } from "@/lib/types";
import { EquipeMember } from "@/lib/hooks/use-equipe";
import { resolveTaskType } from "@/lib/utils/task-alert";
import { TaskConfigModal } from "./task-config-modal";

interface TaskItemProps {
    task: Partial<ChecklistTask> & { tempId: string };
    equipe: EquipeMember[];
    onUpdate: (id: string, updates: Partial<ChecklistTask>) => void;
    onRemove: (id: string) => void;
    onEnter?: () => void;
    setInputRef?: (el: HTMLInputElement | null) => void;
    disableReorder?: boolean;
    isReorderMode?: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    isFirst?: boolean;
    isLast?: boolean;
}

const TYPE_ICON: Record<string, { icon: string; color: string; label: string }> = {
    boolean: { icon: "check_circle", color: "text-[#13b6ec]", label: "Concluir/Não" },
    date: { icon: "event", color: "text-orange-400", label: "Data" },
    number: { icon: "tag", color: "text-purple-400", label: "Número" },
    rating: { icon: "star", color: "text-yellow-400", label: "Avaliação" },
};

export function TaskItem({ task, equipe, onUpdate, onRemove, onEnter, setInputRef, disableReorder = false, isReorderMode = false, onMoveUp, onMoveDown, isFirst = false, isLast = false }: TaskItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.tempId, disabled: disableReorder });

    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showDescription, setShowDescription] = useState<boolean>(!!task.description);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
    };

    const resolvedType = resolveTaskType(task.type ?? null);
    const typeMeta = TYPE_ICON[resolvedType];

    const activeIcons: { icon: string; color: string; title: string }[] = [];
    if (task.requires_photo) activeIcons.push({ icon: "photo_camera", color: "text-[#13b6ec]", title: "Exige foto" });
    if (task.requires_observation) activeIcons.push({ icon: "edit_note", color: "text-[#13b6ec]", title: "Exige observação" });
    if (task.is_critical) activeIcons.push({ icon: "priority_high", color: "text-amber-400", title: "Crítica" });

    return (
        <>
            <div
                ref={setNodeRef}
                style={style}
                className={`group flex items-start gap-3 p-3 bg-[#16262c] border rounded-xl transition-colors ${isDragging ? "border-[#13b6ec] shadow-lg shadow-[#13b6ec]/10 opacity-80" : "border-[#233f48] hover:border-[#325a67]"}`}
            >
                {isReorderMode ? (
                    <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                        <button
                            onClick={onMoveUp}
                            disabled={isFirst}
                            aria-label="Mover tarefa para cima"
                            className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
                                isFirst
                                    ? "border-[#233f48] text-[#233f48] cursor-not-allowed"
                                    : "border-[#325a67] text-[#92bbc9] hover:bg-[#13b6ec]/10 hover:border-[#13b6ec] hover:text-[#13b6ec] active:bg-[#13b6ec]/20"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">keyboard_arrow_up</span>
                        </button>
                        <button
                            onClick={onMoveDown}
                            disabled={isLast}
                            aria-label="Mover tarefa para baixo"
                            className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
                                isLast
                                    ? "border-[#233f48] text-[#233f48] cursor-not-allowed"
                                    : "border-[#325a67] text-[#92bbc9] hover:bg-[#13b6ec]/10 hover:border-[#13b6ec] hover:text-[#13b6ec] active:bg-[#13b6ec]/20"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">keyboard_arrow_down</span>
                        </button>
                    </div>
                ) : !disableReorder ? (
                    <div
                        {...attributes}
                        {...listeners}
                        className="mt-1 flex items-center justify-center p-1 rounded hover:bg-[#1a2c32] cursor-grab active:cursor-grabbing text-[#325a67] group-hover:text-[#92bbc9] transition-colors"
                    >
                        <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
                    </div>
                ) : null}

                <div className="flex-1 min-w-0">
                    {/* Linha 1 — título + responsável + ícones + engrenagem */}
                    <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <input
                                ref={setInputRef}
                                type="text"
                                value={task.title || ""}
                                onChange={(e) => onUpdate(task.tempId, { title: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
                                placeholder="Título da tarefa..."
                                className="w-full bg-transparent border-none outline-none text-white font-bold placeholder:text-[#325a67] placeholder:font-normal focus:ring-0 px-0 py-0"
                            />
                        </div>

                        {/* Ícones ativos */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <span
                                title={typeMeta.label}
                                className={`flex items-center justify-center w-6 h-6 rounded ${typeMeta.color}`}
                            >
                                <span className="material-symbols-outlined text-[16px]">{typeMeta.icon}</span>
                            </span>
                            {activeIcons.map((it) => (
                                <span
                                    key={it.icon}
                                    title={it.title}
                                    className={`flex items-center justify-center w-6 h-6 rounded ${it.color}`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">{it.icon}</span>
                                </span>
                            ))}

                            {/* Engrenagem */}
                            <button
                                onClick={() => setShowConfigModal(true)}
                                title="Configurar"
                                className="ml-1 w-7 h-7 flex items-center justify-center rounded-lg text-[#92bbc9] hover:text-[#13b6ec] hover:bg-[#13b6ec]/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">settings</span>
                            </button>

                            {/* Remover */}
                            <button
                                onClick={() => onRemove(task.tempId)}
                                title="Excluir"
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#325a67] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>
                    </div>

                    {/* Linha 2 — responsável + toggle descrição */}
                    <div className="flex items-center gap-3 mt-2">
                        <button
                            type="button"
                            onClick={() => setShowDescription((v) => !v)}
                            className="flex items-center gap-1 text-xs text-[#92bbc9] hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-[14px]">
                                {showDescription ? "expand_less" : "expand_more"}
                            </span>
                            {showDescription ? "Ocultar descrição" : (task.description ? "Ver descrição" : "Adicionar descrição")}
                        </button>

                        <div className="ml-auto w-40">
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

                    {/* Linha 3 — descrição (colapsável) */}
                    {showDescription && (
                        <textarea
                            value={task.description || ""}
                            onChange={(e) => onUpdate(task.tempId, { description: e.target.value || undefined })}
                            placeholder="Descrição ou instruções (opcional)..."
                            rows={2}
                            className="w-full mt-2 bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#325a67] outline-none focus:border-[#13b6ec] resize-none"
                        />
                    )}
                </div>
            </div>

            {showConfigModal && (
                <TaskConfigModal
                    initial={{
                        type: task.type,
                        is_critical: task.is_critical,
                        requires_photo: task.requires_photo,
                        requires_observation: task.requires_observation,
                        max_photos: task.max_photos,
                        task_config: task.task_config,
                    }}
                    onConfirm={(next) => {
                        onUpdate(task.tempId, next);
                        setShowConfigModal(false);
                    }}
                    onCancel={() => setShowConfigModal(false)}
                />
            )}
        </>
    );
}
