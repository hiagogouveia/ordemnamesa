"use client";

import { useMemo } from "react";
import { ChecklistBoardColumn } from "./ChecklistBoardColumn";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import type { ExecutionStatus } from "@/lib/types";

const STATUS_COLUMNS: {
    status: ExecutionStatus;
    label: string;
    icon: string;
    color: string;
}[] = [
    { status: "not_started", label: "Disponível", icon: "radio_button_unchecked", color: "#92bbc9" },
    { status: "in_progress", label: "Em execução", icon: "pending_actions", color: "#3b82f6" },
    { status: "overdue", label: "Atrasada", icon: "alarm_off", color: "#ef4444" },
    { status: "blocked", label: "Com impedimento", icon: "warning", color: "#eab308" },
    { status: "done", label: "Finalizada", icon: "task_alt", color: "#22c55e" },
];

function isOverdue(checklist: ExtendedChecklist, currentMinutes: number): boolean {
    if (!checklist.end_time) return false;
    if (checklist.execution_status === "done") return false;
    const [h, m] = checklist.end_time.split(":").map(Number);
    return currentMinutes > h * 60 + m;
}

function getComputedStatus(checklist: ExtendedChecklist, currentMinutes: number): ExecutionStatus {
    const apiStatus = (checklist.execution_status ?? "not_started") as ExecutionStatus;
    if (apiStatus !== "done" && isOverdue(checklist, currentMinutes)) return "overdue";
    return apiStatus;
}

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
            not_started: [],
            in_progress: [],
            overdue: [],
            blocked: [],
            done: [],
        };

        for (const c of checklists) {
            const status = getComputedStatus(c, currentMinutes);
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
