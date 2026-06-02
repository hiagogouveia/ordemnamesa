"use client";

import { formatShiftNames } from "@/lib/utils/shift-labels";

import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import { UnitBadge } from "@/components/ui/unit-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { IssueBadge } from "@/components/checklists/issues/IssueBadge";
import { ChecklistTypeBadge } from "@/components/checklists/management/ChecklistTypeBadge";


interface ChecklistBoardCardProps {
    checklist: ExtendedChecklist;
    onSelect: () => void;
    onStatusToggle: (active: boolean) => void;
    isGlobal?: boolean;
    selectable?: boolean;
    checked?: boolean;
    onCheckChange?: (checked: boolean) => void;
    /** Sprint 45: contagem de ocorrências abertas (open + investigating) */
    openIssuesCount?: number;
}

export function ChecklistBoardCard({
    checklist,
    onSelect,
    isGlobal,
    selectable,
    checked,
    onCheckChange,
    openIssuesCount = 0,
}: ChecklistBoardCardProps) {
    const taskCount = checklist.tasks?.length ?? 0;
    // Separa "quem está executando agora" (assumed_by_name) de "quem foi atribuído"
    // (responsible.name vindo de assigned_to_user_id). Confusão entre os dois é
    // a fonte do bug "apareceu mac teste como responsável".
    const executorName = checklist.assumed_by_name || null;
    const assignedName = !executorName ? checklist.responsible?.name ?? null : null;
    const hasOpenIssues = openIssuesCount > 0;
    // 'done' é o único estado de conclusão da rotina (a API normaliza completed_at
    // / execution_status para 'done'). Quando concluída, o card mostra "Concluída
    // por" em vez de "Em execução por", apesar de assumed_by_name persistir (auditoria).
    const isDone = checklist.execution_status === "done";

    return (
        <div
            onClick={onSelect}
            className={`relative bg-[#0a1215] border rounded-xl p-3 cursor-pointer select-none transition-shadow ${
                checked
                    ? "border-[#13b6ec]/40 bg-[#13b6ec]/5"
                    : hasOpenIssues
                        ? "border-amber-500/40 hover:border-amber-500/60 border-l-4 border-l-amber-500"
                        : "border-[#233f48] hover:border-[#325a67]"
            }`}
        >
            {/* Checkbox de seleção (visão global) */}
            {selectable && (
                <div
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCheckChange?.(!checked);
                    }}
                >
                    <Checkbox
                        checked={checked ?? false}
                        readOnly
                        aria-label={`Selecionar ${checklist.name}`}
                    />
                </div>
            )}
            {/* Title + active badge */}
            <div className={`flex items-start justify-between gap-2 ${selectable ? "pl-6" : ""}`}>
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

            {/* Type + Unit badges */}
            {(checklist.checklist_type === "receiving" || (isGlobal && checklist.unit?.name)) && (
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <ChecklistTypeBadge type={checklist.checklist_type} />
                    {isGlobal && checklist.unit?.name && <UnitBadge name={checklist.unit.name} />}
                </div>
            )}

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
                    <span className="flex items-center gap-1 text-orange-400" title="Essa rotina não está vinculada a nenhuma área e não pode ser executada">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        <span className="text-xs font-medium">Sem área</span>
                    </span>
                )}
            </div>

            {/* Quem executou a rotina hoje (assumed_by_name). Concluída → "Concluída por";
                em execução/bloqueada → "Em execução por". */}
            {executorName && (
                isDone ? (
                    <div className="flex items-center gap-1.5 mt-2" title="Quem concluiu esta rotina hoje">
                        <span className="material-symbols-outlined text-[14px] shrink-0 text-emerald-400">task_alt</span>
                        <span className="text-[#92bbc9] text-xs shrink-0">Concluída por</span>
                        <span className="text-white text-sm truncate font-medium">{executorName}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 mt-2" title="Quem iniciou esta rotina hoje">
                        <span className="material-symbols-outlined text-[14px] shrink-0 text-[#13b6ec]">play_arrow</span>
                        <span className="text-[#92bbc9] text-xs shrink-0">Em execução por</span>
                        <span className="text-white text-sm truncate font-medium">{executorName}</span>
                    </div>
                )
            )}
            {/* Atribuído a (responsible) — configuração permanente da rotina */}
            {assignedName && (
                <div className="flex items-center gap-1.5 mt-2" title="Colaborador atribuído à rotina">
                    <span className="material-symbols-outlined text-[14px] shrink-0 text-[#5a8a99]">person</span>
                    <span className="text-[#92bbc9] text-xs shrink-0">Atribuído a</span>
                    <span className="text-[#92bbc9] text-sm truncate">{assignedName}</span>
                </div>
            )}

            {/* Footer: task count + turno + horário */}
            <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[#92bbc9] text-xs">
                        <span className="material-symbols-outlined text-[14px]">checklist</span>
                        {taskCount} {taskCount === 1 ? "tarefa" : "tarefas"}
                    </span>
                    {checklist.execution_status === "done" && checklist.tasks?.some(t => t.requires_photo) && (
                        <span
                            className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full"
                            title="Fotos enviadas"
                        >
                            <span className="material-symbols-outlined text-[11px]">photo_camera</span>
                            Fotos
                        </span>
                    )}
                    <IssueBadge count={openIssuesCount} compact />
                </div>
                <div className="flex items-center gap-2">
                    {checklist.start_time && (
                        <span className="text-[#5a8a99] text-[10px]">
                            {checklist.start_time}
                            {checklist.end_time ? ` - ${checklist.end_time}` : ""}
                        </span>
                    )}
                    <span className="text-[#325a67] text-[10px] font-bold">
                        {formatShiftNames(checklist.shifts)}
                    </span>
                </div>
            </div>
        </div>
    );
}
