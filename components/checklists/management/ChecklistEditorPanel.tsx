"use client";

import { ChecklistForm } from "@/components/checklists/checklist-form";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

const SHIFT_LABELS: Record<string, string> = {
    morning: "Manhã",
    afternoon: "Tarde",
    evening: "Noite",
    any: "Todos os turnos",
};

const RECURRENCE_LABELS: Record<string, string> = {
    none: "Não se repete",
    daily: "Diária",
    weekly: "Semanal",
    monthly: "Mensal",
    yearly: "Anual",
    weekdays: "Dias úteis",
    custom: "Personalizada",
};

const TYPE_LABELS: Record<string, string> = {
    regular: "Regular",
    opening: "Abertura",
    closing: "Fechamento",
    receiving: "Recebimento",
};

interface ChecklistViewPanelProps {
    checklist: ExtendedChecklist;
    onEdit: () => void;
    onClose: () => void;
}

function ChecklistViewPanel({ checklist, onEdit, onClose }: ChecklistViewPanelProps) {
    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-[#233f48] shrink-0">
                <div className="flex-1 min-w-0 pr-3">
                    <h2 className="text-white font-bold text-base leading-snug">{checklist.name}</h2>
                    <div className="flex items-center flex-wrap gap-2 mt-1.5">
                        {checklist.area && (
                            <span className="flex items-center gap-1">
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: checklist.area.color || "#325a67" }}
                                />
                                <span className="text-[#92bbc9] text-xs">{checklist.area.name}</span>
                            </span>
                        )}
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                checklist.active
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                    : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            }`}
                        >
                            {checklist.active ? "Ativo" : "Inativo"}
                        </span>
                        {checklist.status === "draft" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">
                                Rascunho
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#233f48] text-[#92bbc9] hover:text-white transition-colors shrink-0"
                >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {/* Informações básicas */}
                {checklist.description && (
                    <div className="p-4 border-b border-[#1a2c32]">
                        <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide mb-2">Descrição</p>
                        <p className="text-white text-sm leading-relaxed">{checklist.description}</p>
                    </div>
                )}

                {/* Configuração */}
                <div className="p-4 border-b border-[#1a2c32]">
                    <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide mb-3">Configuração</p>
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Turno</span>
                            <span className="text-white text-sm font-medium">
                                {SHIFT_LABELS[checklist.shift] ?? checklist.shift}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Recorrência</span>
                            <span className="text-white text-sm font-medium">
                                {RECURRENCE_LABELS[checklist.recurrence ?? "none"] ?? "—"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Tipo</span>
                            <span className="text-white text-sm font-medium">
                                {TYPE_LABELS[checklist.checklist_type ?? "regular"] ?? "—"}
                            </span>
                        </div>
                        {(checklist.area || checklist.roles) && (
                            <div className="flex items-center justify-between">
                                <span className="text-[#92bbc9] text-sm">Área</span>
                                <span className="flex items-center gap-1.5 text-white text-sm font-medium">
                                    {checklist.area ? (
                                        <>
                                            <span
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: checklist.area.color || "#325a67" }}
                                            />
                                            {checklist.area.name}
                                        </>
                                    ) : (
                                        <>
                                            <span
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: checklist.roles!.color || "#325a67" }}
                                            />
                                            {checklist.roles!.name}
                                        </>
                                    )}
                                </span>
                            </div>
                        )}
                        {checklist.responsible?.name && (
                            <div className="flex items-center justify-between">
                                <span className="text-[#92bbc9] text-sm">Responsável</span>
                                <span className="text-white text-sm font-medium">{checklist.responsible.name}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tarefas */}
                <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">Tarefas</p>
                        <span className="text-[#325a67] text-xs">
                            {checklist.tasks?.length ?? 0}{" "}
                            {(checklist.tasks?.length ?? 0) === 1 ? "tarefa" : "tarefas"}
                        </span>
                    </div>

                    {!checklist.tasks || checklist.tasks.length === 0 ? (
                        <div className="text-center py-8">
                            <span className="material-symbols-outlined text-3xl text-[#325a67]">checklist</span>
                            <p className="text-[#92bbc9] text-sm mt-2">Nenhuma tarefa cadastrada</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {[...checklist.tasks]
                                .sort((a, b) => a.order - b.order)
                                .map((task, idx) => (
                                    <div
                                        key={task.id}
                                        className="flex items-start gap-3 p-3 bg-[#0a1215] border border-[#233f48] rounded-xl"
                                    >
                                        <span className="text-[#325a67] text-xs font-bold w-5 shrink-0 mt-0.5 text-right">
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium leading-snug">{task.title}</p>
                                            {task.description && (
                                                <p className="text-[#92bbc9] text-xs mt-0.5">{task.description}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1.5">
                                                {task.requires_photo && (
                                                    <span className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
                                                        <span className="material-symbols-outlined text-[12px]">
                                                            photo_camera
                                                        </span>
                                                        Foto obrigatória
                                                    </span>
                                                )}
                                                {task.is_critical && (
                                                    <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold">
                                                        <span className="material-symbols-outlined text-[12px]">
                                                            priority_high
                                                        </span>
                                                        Crítica
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#233f48] shrink-0">
                <button
                    onClick={onEdit}
                    className="w-full flex items-center justify-center gap-2 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-sm py-3 rounded-xl transition-colors"
                >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Editar rotina
                </button>
            </div>
        </div>
    );
}

export interface ChecklistEditorPanelProps {
    checklist: ExtendedChecklist | null;
    mode: "view" | "edit" | "new";
    onModeChange: (mode: "view" | "edit" | "new") => void;
    onClose: () => void;
    onSaved: () => void;
}

export function ChecklistEditorPanel({
    checklist,
    mode,
    onModeChange,
    onClose,
    onSaved,
}: ChecklistEditorPanelProps) {
    if (mode === "view" && checklist) {
        return (
            <ChecklistViewPanel
                checklist={checklist}
                onEdit={() => onModeChange("edit")}
                onClose={onClose}
            />
        );
    }

    return (
        <div className="h-full overflow-hidden flex flex-col">
            <ChecklistForm checklist={checklist} onSaved={onSaved} onCancel={onClose} />
        </div>
    );
}
