"use client";

import { ChecklistBoardCard } from "./ChecklistBoardCard";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

interface ChecklistBoardColumnProps {
    label: string;
    icon: string;
    color: string;
    cards: ExtendedChecklist[];
    onSelect: (checklist: ExtendedChecklist) => void;
    onStatusToggle: (id: string, active: boolean) => void;
}

export function ChecklistBoardColumn({
    label,
    icon,
    color,
    cards,
    onSelect,
    onStatusToggle,
}: ChecklistBoardColumnProps) {
    return (
        <div className="min-w-[280px] flex-1 flex flex-col max-h-full rounded-xl border"
            style={{ borderColor: `${color}30` }}
        >
            {/* Column header */}
            <div
                className="flex items-center gap-2 px-4 py-3 rounded-t-xl border-b shrink-0"
                style={{
                    backgroundColor: `${color}10`,
                    borderColor: `${color}30`,
                }}
            >
                <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ color }}
                >
                    {icon}
                </span>
                <h3 className="text-white font-bold text-sm">{label}</h3>
                <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full ml-auto"
                    style={{
                        backgroundColor: `${color}20`,
                        color,
                    }}
                >
                    {cards.length}
                </span>
            </div>

            {/* Cards */}
            <div
                className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 rounded-b-xl"
                style={{ backgroundColor: `${color}05` }}
            >
                {cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <span className="material-symbols-outlined text-[#325a67] text-3xl">inbox</span>
                        <p className="text-[#325a67] text-xs mt-2">Nenhuma rotina</p>
                    </div>
                ) : (
                    cards.map((card) => (
                        <ChecklistBoardCard
                            key={card.id}
                            checklist={card}
                            onSelect={() => onSelect(card)}
                            onStatusToggle={(active) => onStatusToggle(card.id, active)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
