"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChecklistBoardCard } from "./ChecklistBoardCard";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

interface ChecklistBoardColumnProps {
    shift: "morning" | "afternoon" | "evening";
    shiftLabel: string;
    cards: (ExtendedChecklist & { position: number })[];
    editMode: boolean;
    onSelect: (checklist: ExtendedChecklist) => void;
    onStatusToggle: (id: string, active: boolean) => void;
}

export function ChecklistBoardColumn({
    shift,
    shiftLabel,
    cards,
    editMode,
    onSelect,
    onStatusToggle,
}: ChecklistBoardColumnProps) {
    const sortableIds = cards.map((c) => `${c.id}-${shift}`);

    return (
        <div className="min-w-[280px] flex-1 bg-[#16262c] border border-[#233f48] rounded-xl flex flex-col max-h-full">
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#233f48] shrink-0">
                <h3 className="text-white font-bold text-sm">{shiftLabel}</h3>
                <span className="bg-[#233f48] text-[#92bbc9] text-xs font-bold px-2 py-0.5 rounded-full">
                    {cards.length}
                </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {cards.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <span className="material-symbols-outlined text-[#325a67] text-3xl">inbox</span>
                            <p className="text-[#325a67] text-xs mt-2">Nenhuma lista</p>
                        </div>
                    ) : (
                        cards.map((card) => (
                            <ChecklistBoardCard
                                key={`${card.id}-${shift}`}
                                checklist={card}
                                shift={shift}
                                editMode={editMode}
                                onSelect={() => onSelect(card)}
                                onStatusToggle={(active) => onStatusToggle(card.id, active)}
                            />
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
    );
}
