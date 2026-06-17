"use client";

import { useState } from "react";
import type { RecurrenceV2, WeekOfMonth } from "@/lib/types";
import {
    buildMonthlyDaysOfMonth,
    buildMonthlyWeekdayPosition,
} from "@/lib/utils/recurrence/build-modal";
import { RecurrenceModal } from "./recurrence-modal";
import { NextOccurrencesPreview } from "./next-occurrences-preview";

const WEEKDAYS = [
    { value: 0, label: "Domingo" },
    { value: 1, label: "Segunda-feira" },
    { value: 2, label: "Terça-feira" },
    { value: 3, label: "Quarta-feira" },
    { value: 4, label: "Quinta-feira" },
    { value: 5, label: "Sexta-feira" },
    { value: 6, label: "Sábado" },
];

const POSITIONS: { value: WeekOfMonth; label: string }[] = [
    { value: 1, label: "1ª" },
    { value: 2, label: "2ª" },
    { value: 3, label: "3ª" },
    { value: 4, label: "4ª" },
    { value: -1, label: "Última" },
];

interface MonthlyConfigProps {
    initial?: RecurrenceV2 & { type: "monthly" };
    onConfirm: (config: RecurrenceV2) => void;
    onCancel: () => void;
    shifts?: { shift_type?: string | null; days_of_week: number[] }[];
    shiftLabel?: string | null;
}

export function MonthlyConfig({
    initial,
    onConfirm,
    onCancel,
    shifts,
    shiftLabel,
}: MonthlyConfigProps) {
    const [mode, setMode] = useState<"day_of_month" | "weekday_position">(
        initial?.mode === "weekday_position" ? "weekday_position" : "day_of_month",
    );
    const [selectedDays, setSelectedDays] = useState<number[]>(() => {
        if (initial?.mode === "days_of_month") return initial.days;
        if (initial?.mode === "day_of_month") return [initial.day];
        return [1];
    });
    const [weekday, setWeekday] = useState<number>(
        initial?.mode === "weekday_position" ? initial.weekday : 1,
    );
    const [weekOfMonth, setWeekOfMonth] = useState<WeekOfMonth>(
        initial?.mode === "weekday_position" ? initial.weekOfMonth : 1,
    );

    const toggleDay = (value: number) => {
        setSelectedDays((prev) =>
            prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
        );
    };

    const config: RecurrenceV2 =
        mode === "day_of_month"
            ? buildMonthlyDaysOfMonth(selectedDays)
            : buildMonthlyWeekdayPosition(weekday, weekOfMonth);

    const canConfirm =
        mode === "day_of_month" ? selectedDays.length > 0 : true;

    return (
        <RecurrenceModal
            title="Mensal"
            canConfirm={canConfirm}
            invalidHint="Selecione ao menos um dia."
            onConfirm={() => onConfirm(config)}
            onCancel={onCancel}
        >
            {/* Radio: modo */}
            <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${mode === 'day_of_month' ? 'border-[#13b6ec]' : 'border-[#325a67]'}`}>
                        {mode === 'day_of_month' && <div className="w-2 h-2 rounded-full bg-[#13b6ec]" />}
                    </div>
                    <input
                        type="radio"
                        className="sr-only"
                        checked={mode === "day_of_month"}
                        onChange={() => setMode("day_of_month")}
                    />
                    <span className="text-white text-sm font-medium">Dia do mês</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${mode === 'weekday_position' ? 'border-[#13b6ec]' : 'border-[#325a67]'}`}>
                        {mode === 'weekday_position' && <div className="w-2 h-2 rounded-full bg-[#13b6ec]" />}
                    </div>
                    <input
                        type="radio"
                        className="sr-only"
                        checked={mode === "weekday_position"}
                        onChange={() => setMode("weekday_position")}
                    />
                    <span className="text-white text-sm font-medium">Padrão semanal</span>
                </label>
            </div>

            {/* Configuração específica */}
            {mode === "day_of_month" ? (
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">
                        Nos dias
                    </label>
                    <div className="grid grid-cols-7 gap-1.5">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => toggleDay(d)}
                                className={`h-9 rounded-lg text-xs font-bold transition-all ${
                                    selectedDays.includes(d)
                                        ? 'bg-[#13b6ec] text-[#0a1215]'
                                        : 'bg-[#101d22] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]'
                                }`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => toggleDay(-1)}
                        className={`mt-1 self-start px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                            selectedDays.includes(-1)
                                ? 'bg-[#13b6ec] text-[#0a1215]'
                                : 'bg-[#101d22] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]'
                        }`}
                    >
                        Último dia do mês
                    </button>
                    <p className="text-[#92bbc9] text-xs">
                        Em meses com menos dias, os dias inexistentes são pulados (ex: dia 31 em fevereiro).
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">
                            Semana do mês
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                            {POSITIONS.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => setWeekOfMonth(p.value)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                        weekOfMonth === p.value
                                            ? 'bg-[#13b6ec] text-[#0a1215]'
                                            : 'bg-[#101d22] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]'
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">
                            Dia da semana
                        </label>
                        <select
                            value={weekday}
                            onChange={(e) => setWeekday(parseInt(e.target.value))}
                            className="bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                        >
                            {WEEKDAYS.map((w) => (
                                <option key={w.value} value={w.value}>{w.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            <NextOccurrencesPreview
                config={canConfirm ? config : null}
                shifts={shifts}
                shiftLabel={shiftLabel}
            />
        </RecurrenceModal>
    );
}
