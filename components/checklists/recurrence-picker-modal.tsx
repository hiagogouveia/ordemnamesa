"use client";

import { useState } from "react";
import type { RecurrenceConfig, RecurrenceV2 } from "@/lib/types";
// Import direto (não barrel) — evita carregar `evaluate`/`validate` no client.
import { legacyConfigToV2Rrule } from "@/lib/utils/recurrence/legacy-to-v2-rrule";

interface RecurrencePickerProps {
    initial?: RecurrenceConfig;
    /**
     * PR 3: o picker mantém o estado interno em formato v1 (mais ergonômico
     * para a UI atual: frequency + interval + days_of_week + end), mas
     * **converte para v2 (`type:'custom'` + rrule RFC 5545) na confirmação**.
     * Isso garante que toda promoção pelo picker produza um payload v2.
     */
    onConfirm: (config: RecurrenceV2) => void;
    onCancel: () => void;
}

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function RecurrencePicker({ initial, onConfirm, onCancel }: RecurrencePickerProps) {
    const [frequency, setFrequency] = useState<RecurrenceConfig['frequency']>(initial?.frequency ?? 'weekly');
    const [interval, setIntervalVal] = useState(initial?.interval ?? 1);
    const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.days_of_week ?? [1]); // Monday default
    const [endType, setEndType] = useState<RecurrenceConfig['end_type']>(initial?.end_type ?? 'never');
    const [endDate, setEndDate] = useState(initial?.end_date ?? '');
    const [endCount, setEndCount] = useState(initial?.end_count ?? 1);

    const toggleDay = (day: number) => {
        setDaysOfWeek(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
        );
    };

    const handleConfirm = () => {
        const legacy: RecurrenceConfig = {
            frequency,
            interval: Math.max(1, interval),
            end_type: endType,
        };
        if (frequency === 'weekly') {
            legacy.days_of_week = daysOfWeek.length > 0 ? daysOfWeek : [1];
        }
        if (endType === 'date' && endDate) legacy.end_date = endDate;
        if (endType === 'count' && endCount > 0) legacy.end_count = endCount;
        onConfirm(legacyConfigToV2Rrule(legacy));
    };

    const freqLabels: Record<RecurrenceConfig['frequency'], { singular: string; plural: string }> = {
        daily: { singular: 'dia', plural: 'dias' },
        weekly: { singular: 'semana', plural: 'semanas' },
        monthly: { singular: 'mês', plural: 'meses' },
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-[400px] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#233f48]">
                    <h2 className="text-white font-bold text-base">Personalizar repetição</h2>
                    <button
                        onClick={onCancel}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col gap-5">

                    {/* Frequency row */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Repetir a cada</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min={1}
                                max={99}
                                value={interval}
                                onChange={(e) => setIntervalVal(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-16 bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white text-center font-bold focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                            />
                            <div className="flex gap-2 flex-1">
                                {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setFrequency(f)}
                                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${frequency === f
                                            ? 'bg-[#13b6ec] text-[#0a1215]'
                                            : 'bg-[#101d22] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]'
                                            }`}
                                    >
                                        {interval === 1 ? freqLabels[f].singular : freqLabels[f].plural}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Days of week (only for weekly) */}
                    {frequency === 'weekly' && (
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Nos dias</label>
                            <div className="flex gap-1.5">
                                {DAY_LABELS.map((label, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => toggleDay(idx)}
                                        title={DAY_FULL[idx]}
                                        className={`flex-1 h-9 rounded-full text-xs font-bold transition-all ${daysOfWeek.includes(idx)
                                            ? 'bg-[#13b6ec] text-[#0a1215] shadow-[0_0_8px_rgba(19,182,236,0.3)]'
                                            : 'bg-[#101d22] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]'
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {daysOfWeek.length === 0 && (
                                <p className="text-amber-400 text-xs">Selecione ao menos um dia</p>
                            )}
                        </div>
                    )}

                    {/* End condition */}
                    <div className="flex flex-col gap-3">
                        <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Término</label>

                        {/* Never */}
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${endType === 'never' ? 'border-[#13b6ec]' : 'border-[#325a67]'}`}>
                                {endType === 'never' && <div className="w-2 h-2 rounded-full bg-[#13b6ec]" />}
                            </div>
                            <input type="radio" className="sr-only" checked={endType === 'never'} onChange={() => setEndType('never')} />
                            <span className="text-white text-sm font-medium">Nunca</span>
                        </label>

                        {/* On date */}
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${endType === 'date' ? 'border-[#13b6ec]' : 'border-[#325a67]'}`}>
                                {endType === 'date' && <div className="w-2 h-2 rounded-full bg-[#13b6ec]" />}
                            </div>
                            <input type="radio" className="sr-only" checked={endType === 'date'} onChange={() => setEndType('date')} />
                            <span className="text-white text-sm font-medium">Em:</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setEndType('date'); }}
                                onClick={() => setEndType('date')}
                                className="flex-1 bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-1.5 text-white text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                            />
                        </label>

                        {/* After N occurrences */}
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${endType === 'count' ? 'border-[#13b6ec]' : 'border-[#325a67]'}`}>
                                {endType === 'count' && <div className="w-2 h-2 rounded-full bg-[#13b6ec]" />}
                            </div>
                            <input type="radio" className="sr-only" checked={endType === 'count'} onChange={() => setEndType('count')} />
                            <span className="text-white text-sm font-medium">Após:</span>
                            <input
                                type="number"
                                min={1}
                                max={999}
                                value={endCount}
                                onChange={(e) => { setEndCount(Math.max(1, parseInt(e.target.value) || 1)); setEndType('count'); }}
                                onClick={() => setEndType('count')}
                                className="w-16 bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-1.5 text-white text-center text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                            />
                            <span className="text-white text-sm font-medium">ocorrência(s)</span>
                        </label>
                    </div>

                </div>

                {/* Footer */}
                <div className="flex gap-3 p-4 border-t border-[#233f48]">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 py-3 rounded-xl bg-[#233f48] text-white font-bold text-sm hover:bg-[#2c4e5a] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={frequency === 'weekly' && daysOfWeek.length === 0}
                        className="flex-1 py-3 rounded-xl bg-[#13b6ec] text-[#0a1215] font-bold text-sm hover:bg-[#10a1d4] transition-colors shadow-[0_4px_14px_0_rgba(19,182,236,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}
