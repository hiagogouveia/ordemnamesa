"use client";

import { useMemo } from "react";
import { ChecklistBoardColumn } from "./ChecklistBoardColumn";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import type { ExecutionStatus } from "@/lib/types";
import { getOperationalStatus } from "@/lib/utils/get-operational-status";

const STATUS_COLUMNS: {
    status: ExecutionStatus;
    label: string;
    icon: string;
    color: string;
}[] = [
    { status: "incomplete", label: "Sem área", icon: "error_outline", color: "#f97316" },
    { status: "not_started", label: "Disponível", icon: "radio_button_unchecked", color: "#92bbc9" },
    { status: "in_progress", label: "Em execução", icon: "pending_actions", color: "#3b82f6" },
    { status: "overdue", label: "Atrasada", icon: "alarm_off", color: "#ef4444" },
    { status: "blocked", label: "Com impedimento", icon: "warning", color: "#eab308" },
    { status: "done", label: "Finalizada", icon: "task_alt", color: "#22c55e" },
];

interface ChecklistBoardViewProps {
    checklists: ExtendedChecklist[];
    isLoading: boolean;
    currentMinutes: number;
    onSelect: (checklist: ExtendedChecklist) => void;
    onStatusToggle: (id: string, active: boolean) => void;
}

export function ChecklistBoardView({
    checklists,
    isLoading,
    currentMinutes,
    onSelect,
    onStatusToggle,
}: ChecklistBoardViewProps) {
    const grouped = useMemo(() => {
        const map: Record<ExecutionStatus, ExtendedChecklist[]> = {
            incomplete: [],
            not_started: [],
            in_progress: [],
            overdue: [],
            blocked: [],
            done: [],
        };

        for (const c of checklists) {
            const status = getOperationalStatus(c, currentMinutes);
            map[status].push(c);
        }

        return map;
    }, [checklists, currentMinutes]);

    if (isLoading) {
        return (
            <div className="flex gap-4 h-full">
                {STATUS_COLUMNS.map((col) => (
                    <div
                        key={col.status}
                        className="min-w-[280px] flex-1 bg-[#16262c] border border-[#233f48] rounded-xl p-3 flex flex-col gap-2"
                    >
                        <div className="animate-pulse bg-[#233f48] h-8 rounded-lg mb-1" />
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="animate-pulse bg-[#0a1215] border border-[#233f48] rounded-xl h-20"
                            />
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex gap-4 flex-1 overflow-x-auto pb-2">
            {STATUS_COLUMNS.map((col) => (
                <ChecklistBoardColumn
                    key={col.status}
                    label={col.label}
                    icon={col.icon}
                    color={col.color}
                    cards={grouped[col.status]}
                    onSelect={onSelect}
                    onStatusToggle={onStatusToggle}
                />
            ))}
        </div>
    );
}
