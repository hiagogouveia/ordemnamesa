"use client";

import { useState } from "react";
import type { RecurrenceV2 } from "@/lib/types";
import { buildDailyExcept } from "@/lib/utils/recurrence/build-modal";
import { RecurrenceModal } from "./recurrence-modal";
import { NextOccurrencesPreview } from "./next-occurrences-preview";

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DailyConfigProps {
    /** Lista inicial de dias excluídos (0=Dom, 6=Sab). */
    initialExcluded?: number[];
    onConfirm: (config: RecurrenceV2) => void;
    onCancel: () => void;
    shifts?: { shift_type?: string | null; days_of_week: number[] }[];
    shiftLabel?: string | null;
}

/**
 * Modal "Diário" — admin pode marcar dias para EXCLUIR. Vazio = todos os dias.
 * Conversão (decisão P2): vira `weekly` com lista de dias permitidos quando há
 * exclusões, ou `daily` puro quando não há.
 */
export function DailyConfig({
    initialExcluded = [],
    onConfirm,
    onCancel,
    shifts,
    shiftLabel,
}: DailyConfigProps) {
    const [excluded, setExcluded] = useState<number[]>([...initialExcluded].sort());

    const toggleDay = (d: number) => {
        setExcluded((prev) =>
            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
        );
    };

    // Não pode excluir os 7 dias (sobraria nada)
    const canConfirm = excluded.length < 7;
    const previewConfig = canConfirm ? buildDailyExcept(excluded) : null;

    return (
        <RecurrenceModal
            title="Diário"
            canConfirm={canConfirm}
            invalidHint="Selecione no máximo 6 dias para excluir."
            onConfirm={() => onConfirm(buildDailyExcept(excluded))}
            onCancel={onCancel}
        >
            <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">
                    Exceto nos dias
                </label>
                <p className="text-[#92bbc9] text-xs">
                    Marque os dias em que esta rotina <span className="font-bold">não</span> deve aparecer.
                </p>
                <div className="flex gap-1.5 mt-1">
                    {DAY_LABELS.map((label, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDay(idx)}
                            title={DAY_FULL[idx]}
                            className={`flex-1 h-9 rounded-full text-xs font-bold transition-all ${
                                excluded.includes(idx)
                                    ? 'bg-red-500/80 text-white shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                                    : 'bg-[#101d22] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {excluded.length === 0 && (
                    <p className="text-[#92bbc9] text-xs italic mt-1">
                        Nenhum dia excluído — equivale a &quot;Todos os dias&quot;.
                    </p>
                )}
            </div>

            <NextOccurrencesPreview
                config={previewConfig}
                shifts={shifts}
                shiftLabel={shiftLabel}
            />
        </RecurrenceModal>
    );
}
