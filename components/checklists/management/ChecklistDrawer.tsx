"use client";

import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

interface ChecklistDrawerProps {
    checklist: ExtendedChecklist | null;
    open: boolean;
    onClose: () => void;
    onEdit?: () => void;
}

export function ChecklistDrawer({ checklist, open, onClose, onEdit }: ChecklistDrawerProps) {
    const handleEdit = () => {
        if (!checklist) return;
        onClose();
        onEdit?.();
    };

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={`fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-[#101d22] border-l border-[#233f48] flex flex-col transform transition-transform duration-300 ease-in-out ${
                    open ? "translate-x-0" : "translate-x-full"
                }`}
            >
                {checklist && (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between p-4 border-b border-[#233f48]">
                            <div className="flex-1 min-w-0 pr-3">
                                <h2 className="text-white font-bold text-base leading-snug">
                                    {checklist.name}
                                </h2>
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
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        checklist.active
                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                            : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                                    }`}>
                                        {checklist.active ? "Ativo" : "Inativo"}
                                    </span>
                                    {checklist.roles?.name && (
                                        <span className="text-[#92bbc9] text-xs">
                                            {checklist.roles.name}
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

                        {/* Conteúdo: lista de tarefas */}
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">
                                    Tarefas
                                </h3>
                                <span className="text-[#325a67] text-xs">
                                    {checklist.tasks?.length ?? 0} {(checklist.tasks?.length ?? 0) === 1 ? "tarefa" : "tarefas"}
                                </span>
                            </div>

                            {!checklist.tasks || checklist.tasks.length === 0 ? (
                                <div className="text-center py-8">
                                    <span className="material-symbols-outlined text-3xl text-[#325a67]">
                                        checklist
                                    </span>
                                    <p className="text-[#92bbc9] text-sm mt-2">Nenhuma tarefa cadastrada</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {[...checklist.tasks]
                                        .sort((a, b) => a.order - b.order)
                                        .map((task, idx) => (
                                            <div
                                                key={task.id}
                                                className="flex items-start gap-3 p-3 bg-[#16262c] border border-[#233f48] rounded-xl"
                                            >
                                                <span className="text-[#325a67] text-xs font-bold w-5 shrink-0 mt-0.5 text-right">
                                                    {idx + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-medium leading-snug">
                                                        {task.title}
                                                    </p>
                                                    {task.description && (
                                                        <p className="text-[#92bbc9] text-xs mt-0.5">
                                                            {task.description}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        {task.requires_photo && (
                                                            <span className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
                                                                <span className="material-symbols-outlined text-[12px]">photo_camera</span>
                                                                Foto obrigatória
                                                            </span>
                                                        )}
                                                        {task.is_critical && (
                                                            <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold">
                                                                <span className="material-symbols-outlined text-[12px]">priority_high</span>
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

                        {/* Footer */}
                        <div className="p-4 border-t border-[#233f48]">
                            <button
                                onClick={handleEdit}
                                className="w-full flex items-center justify-center gap-2 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-sm py-3 rounded-xl transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                Editar rotina
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
