"use client";

import { useMemo } from "react";
import { RoutineCard } from "@/components/checklists/routine-card";
import { IphoneMockup } from "@/components/ui/iphone-mockup";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import type { PriorityMode } from "@/lib/types";

interface ChecklistPreviewViewProps {
    checklists: ExtendedChecklist[];
    currentMinutes: number;
    priorityMode?: PriorityMode;
}

function minutesToHHMM(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
}

interface PreviewSection {
    title: string;
    icon: string;
    iconColor: string;
    items: ExtendedChecklist[];
}

export function ChecklistPreviewView({ checklists, currentMinutes, priorityMode = "auto" }: ChecklistPreviewViewProps) {
    const nowHHMM = minutesToHHMM(currentMinutes);

    const sections: PreviewSection[] = useMemo(() => {
        // When manual mode, show all items in a single "Rotinas" section preserving order_index
        if (priorityMode === "manual") {
            return [
                {
                    title: "Rotinas",
                    icon: "checklist",
                    iconColor: "#92bbc9",
                    items: [...checklists].sort(
                        (a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999)
                    ),
                },
            ];
        }

        // Auto mode: split into overdue/pending
        const overdue: ExtendedChecklist[] = [];
        const pending: ExtendedChecklist[] = [];

        for (const c of checklists) {
            if (c.end_time && nowHHMM > c.end_time && c.execution_status !== "done") {
                overdue.push(c);
            } else {
                pending.push(c);
            }
        }

        return [
            { title: "Atrasadas", icon: "alarm_off", iconColor: "#ef4444", items: overdue },
            { title: "Pendentes", icon: "radio_button_unchecked", iconColor: "#92bbc9", items: pending },
        ];
    }, [checklists, nowHHMM, priorityMode]);

    /** Content rendered inside the mockup (and in plain flow on mobile) */
    const content = (
        <div className="px-4 pt-2 pb-10 flex flex-col gap-6">
            {/* Priority mode indicator */}
            <div className="flex items-center justify-center gap-1.5 py-1">
                <span
                    className={`material-symbols-outlined text-[12px] ${
                        priorityMode === "auto" ? "text-emerald-400" : "text-amber-400"
                    }`}
                >
                    {priorityMode === "auto" ? "auto_mode" : "touch_app"}
                </span>
                <span
                    className={`text-[10px] font-bold ${
                        priorityMode === "auto" ? "text-emerald-400" : "text-amber-400"
                    }`}
                >
                    {priorityMode === "auto" ? "Ordenação automática" : "Ordenação manual"}
                </span>
            </div>

            {/* Empty state */}
            {checklists.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <span className="material-symbols-outlined text-[#325a67] text-5xl">task_alt</span>
                    <p className="text-white font-semibold">Nenhuma rotina</p>
                    <p className="text-[#92bbc9] text-sm max-w-xs">
                        Ajuste os filtros de área e turno para ver as rotinas.
                    </p>
                </div>
            )}

            {/* Sections */}
            {sections.map((section) => {
                if (section.items.length === 0) return null;
                return (
                    <div key={section.title}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 mb-3">
                            <span
                                className="material-symbols-outlined text-[18px]"
                                style={{ color: section.iconColor }}
                            >
                                {section.icon}
                            </span>
                            <span className="text-sm font-bold text-white">{section.title}</span>
                            <span className="text-xs font-bold bg-[#16262c] text-[#92bbc9] border border-[#233f48] px-2 py-0.5 rounded-full">
                                {section.items.length}
                            </span>
                        </div>

                        {/* Cards */}
                        <div className="flex flex-col gap-3">
                            {section.items.map((c) => (
                                <RoutineCard
                                    key={c.id}
                                    variant="collaborator_todo"
                                    isPreview
                                    title={c.name}
                                    start_time={c.start_time}
                                    end_time={c.end_time}
                                    currentMinutes={currentMinutes}
                                    itemsCount={c.tasks?.length ?? 0}
                                    isRequired={c.is_required ?? false}
                                    area={c.area?.name}
                                    onClick={() => {}}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="w-full flex flex-col items-center gap-5">
            {/* Preview banner — always visible, outside the mockup frame */}
            <div className="w-full max-w-[390px] flex items-center gap-2 px-3 py-2 rounded-lg bg-[#13b6ec]/10 border border-[#13b6ec]/20">
                <span className="material-symbols-outlined text-[16px] text-[#13b6ec]">visibility</span>
                <span className="text-xs font-bold text-[#13b6ec]">Visualização do colaborador</span>
                <span className="text-[11px] text-[#13b6ec]/60 ml-1">— somente leitura</span>
            </div>

            {/* iPhone mockup (desktop) or plain cards (mobile) */}
            <IphoneMockup>
                {content}
            </IphoneMockup>
        </div>
    );
}
