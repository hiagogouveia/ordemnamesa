"use client";

import type { Area } from "@/lib/types";

interface AreaFilterBarProps {
    areas: Area[];
    activeAreaId: string | "all";
    onSelect: (id: string | "all") => void;
}

export function AreaFilterBar({ areas, activeAreaId, onSelect }: AreaFilterBarProps) {
    if (areas.length === 0) return null;

    return (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
            <button
                onClick={() => onSelect("all")}
                className={`shrink-0 snap-start flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    activeAreaId === "all"
                        ? "bg-[#13b6ec]/20 text-[#13b6ec] border-[#13b6ec]/40"
                        : "bg-[#16262c] text-[#92bbc9] border-[#233f48] hover:border-[#325a67]"
                }`}
            >
                Todas
            </button>

            {areas.map((area) => (
                <button
                    key={area.id}
                    onClick={() => onSelect(area.id)}
                    className={`shrink-0 snap-start flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        activeAreaId === area.id
                            ? "bg-[#13b6ec]/20 text-[#13b6ec] border-[#13b6ec]/40"
                            : "bg-[#16262c] text-[#92bbc9] border-[#233f48] hover:border-[#325a67]"
                    }`}
                >
                    <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: area.color }}
                    />
                    {area.name}
                </button>
            ))}
        </div>
    );
}
