"use client";

import type { Area } from "@/lib/types";

const SHIFT_CHIPS = [
    { value: "", label: "Todos" },
    { value: "morning", label: "Manhã" },
    { value: "afternoon", label: "Tarde" },
    { value: "evening", label: "Noite" },
];

interface ChecklistFiltersProps {
    visible: boolean;
    selectedShift: string;
    onShiftChange: (shift: string) => void;
    selectedAreaId: string;
    onAreaChange: (areaId: string) => void;
    areas: Area[];
}

export function ChecklistFilters({
    visible,
    selectedShift,
    onShiftChange,
    selectedAreaId,
    onAreaChange,
    areas,
}: ChecklistFiltersProps) {
    if (!visible) return null;

    return (
        <div className="shrink-0 px-4 py-3 border-b border-[#233f48] bg-[#0a1215] flex flex-col gap-3">
            {/* Turno */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide shrink-0">Turno:</span>
                {SHIFT_CHIPS.map((chip) => (
                    <button
                        key={chip.value}
                        onClick={() => onShiftChange(chip.value)}
                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                            selectedShift === chip.value
                                ? "bg-[#13b6ec]/20 text-[#13b6ec] border-[#13b6ec]/40"
                                : "bg-[#16262c] text-[#92bbc9] border-[#233f48] hover:text-white"
                        }`}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>

            {/* Área */}
            {areas.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide shrink-0">Área:</span>
                    <button
                        onClick={() => onAreaChange("")}
                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                            selectedAreaId === ""
                                ? "bg-[#13b6ec]/20 text-[#13b6ec] border-[#13b6ec]/40"
                                : "bg-[#16262c] text-[#92bbc9] border-[#233f48] hover:text-white"
                        }`}
                    >
                        Todas
                    </button>
                    {areas.map((area) => (
                        <button
                            key={area.id}
                            onClick={() => onAreaChange(area.id)}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                                selectedAreaId === area.id
                                    ? "bg-[#13b6ec]/20 text-[#13b6ec] border-[#13b6ec]/40"
                                    : "bg-[#16262c] text-[#92bbc9] border-[#233f48] hover:text-white"
                            }`}
                        >
                            {area.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
