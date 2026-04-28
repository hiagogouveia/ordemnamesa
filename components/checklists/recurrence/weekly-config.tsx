"use client";

import { useState } from "react";
import type { RecurrenceV2 } from "@/lib/types";
import { buildWeekly } from "@/lib/utils/recurrence/build-modal";
import { RecurrenceModal } from "./recurrence-modal";
import { NextOccurrencesPreview } from "./next-occurrences-preview";

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface WeeklyConfigProps {
    initialWeekdays?: number[];
    onConfirm: (config: RecurrenceV2) => void;
    onCancel: () => void;
    shifts?: { shift_type?: string | null; days_of_week: number[] }[];
    shiftLabel?: string | null;
}

export function WeeklyConfig({
    initialWeekdays,
    onConfirm,
    onCancel,
    shifts,
    shiftLabel,
}: WeeklyConfigProps) {
    const [weekdays, setWeekdays] = useState<number[]>(
        initialWeekdays && initialWeekdays.length > 0 ? [...initialWeekdays].sort() : [1],
    );

    const toggleDay = (d: number) => {
        setWeekdays((prev) =>
            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
        );
    };

    const canConfirm = weekdays.length > 0;
    const previewConfig = canConfirm ? buildWeekly(weekdays) : null;

    return (
        <RecurrenceModal
            title="Semanal"
            canConfirm={canConfirm}
            invalidHint="Selecione ao menos um dia."
            onConfirm={() => onConfirm(buildWeekly(weekdays))}
            onCancel={onCancel}
        >
            <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">
                    Repetir nos dias
                </label>
                <div className="flex gap-1.5 mt-1">
                    {DAY_LABELS.map((label, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDay(idx)}
                            title={DAY_FULL[idx]}
                            className={`flex-1 h-9 rounded-full text-xs font-bold transition-all ${
                                weekdays.includes(idx)
                                    ? 'bg-[#13b6ec] text-[#0a1215] shadow-[0_0_8px_rgba(19,182,236,0.3)]'
                                    : 'bg-[#101d22] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <NextOccurrencesPreview
                config={previewConfig}
                shifts={shifts}
                shiftLabel={shiftLabel}
            />
        </RecurrenceModal>
    );
}
