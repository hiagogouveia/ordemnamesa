"use client";

import { useState } from "react";
import type { RecurrenceV2, WeekOfMonth } from "@/lib/types";
import {
    buildYearlyDate,
    buildYearlyWeekdayPosition,
} from "@/lib/utils/recurrence/build-modal";
import { RecurrenceModal } from "./recurrence-modal";
import { NextOccurrencesPreview } from "./next-occurrences-preview";

const MONTHS = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
];

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

interface YearlyConfigProps {
    initial?: RecurrenceV2 & { type: "yearly" };
    onConfirm: (config: RecurrenceV2) => void;
    onCancel: () => void;
    shifts?: { shift_type?: string | null; days_of_week: number[] }[];
    shiftLabel?: string | null;
}

export function YearlyConfig({
    initial,
    onConfirm,
    onCancel,
    shifts,
    shiftLabel,
}: YearlyConfigProps) {
    const [mode, setMode] = useState<"date" | "weekday_position">(
        initial?.mode ?? "date",
    );
    const [day, setDay] = useState<number>(
        initial?.mode === "date" ? initial.day : 1,
    );
    const [month, setMonth] = useState<number>(
        initial?.mode === "date"
            ? initial.month
            : initial?.mode === "weekday_position"
                ? initial.month
                : 1,
    );
    const [weekday, setWeekday] = useState<number>(
        initial?.mode === "weekday_position" ? initial.weekday : 1,
    );
    const [weekOfMonth, setWeekOfMonth] = useState<WeekOfMonth>(
        initial?.mode === "weekday_position" ? initial.weekOfMonth : 1,
    );

    const config: RecurrenceV2 =
        mode === "date"
            ? buildYearlyDate(day, month)
            : buildYearlyWeekdayPosition(weekday, weekOfMonth, month);

    const canConfirm =
        mode === "date"
            ? Number.isInteger(day) && day >= 1 && day <= 31
            : true;

    return (
        <RecurrenceModal
            title="Anual"
            canConfirm={canConfirm}
            invalidHint="Dia deve estar entre 1 e 31."
            onConfirm={() => onConfirm(config)}
            onCancel={onCancel}
        >
            {/* Radio: modo */}
            <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${mode === 'date' ? 'border-[#13b6ec]' : 'border-[#325a67]'}`}>
                        {mode === 'date' && <div className="w-2 h-2 rounded-full bg-[#13b6ec]" />}
                    </div>
                    <input
                        type="radio"
                        className="sr-only"
                        checked={mode === "date"}
                        onChange={() => setMode("date")}
                    />
                    <span className="text-white text-sm font-medium">Data específica</span>
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

            {mode === "date" ? (
                <div className="flex gap-3 items-end">
                    <div className="flex flex-col gap-2 flex-1">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Mês</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(parseInt(e.target.value))}
                            className="bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                        >
                            {MONTHS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2 w-24">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Dia</label>
                        <input
                            type="number"
                            min={1}
                            max={31}
                            value={day}
                            onChange={(e) =>
                                setDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))
                            }
                            className="bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white text-center font-bold focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                        />
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Semana do mês</label>
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
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Dia da semana</label>
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
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Mês</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(parseInt(e.target.value))}
                            className="bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                        >
                            {MONTHS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
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
