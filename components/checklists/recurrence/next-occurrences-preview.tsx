"use client";

import { useMemo } from "react";
import type { RecurrenceV2 } from "@/lib/types";
import { getNextOccurrences, type PreviewOccurrence } from "@/lib/utils/recurrence/preview";
import { getBrazilNow } from "@/lib/utils/brazil-date";

interface NextOccurrencesPreviewProps {
    config: RecurrenceV2 | null;
    /** Shifts ativos do restaurante (para `shift_days` opcional). */
    shifts?: { shift_type?: string | null; days_of_week: number[] }[];
    shiftLabel?: string | null;
}

/**
 * Para recorrência anual, exibimos `dd/MM/yyyy` (o ano é a parte que diferencia
 * cada ocorrência); para os demais tipos, mantemos `dd/MM` (mais curto).
 */
function formatOccurrence(o: PreviewOccurrence, includeYear: boolean): string {
    if (!includeYear) return o.shortLabel;
    const year = o.dateKey.slice(0, 4);
    return `${o.shortLabel}/${year}`;
}

/**
 * Mostra "Próximas execuções" para o config v2 atual. Para `custom`, exibe
 * texto neutro (rrule não é avaliada no client por decisão de bundle).
 */
export function NextOccurrencesPreview({
    config,
    shifts,
    shiftLabel,
}: NextOccurrencesPreviewProps) {
    const occurrences = useMemo(() => {
        if (!config) return null;
        const brazil = getBrazilNow();
        return getNextOccurrences(config, {
            dayOfWeek: brazil.dayOfWeek,
            dateKey: brazil.dateKey,
            shifts,
            shiftLabel,
        });
    }, [config, shifts, shiftLabel]);

    if (!config) return null;

    const includeYear = config.type === "yearly";

    return (
        <div className="bg-[#101d22] border border-[#233f48] rounded-xl p-4 flex flex-col gap-2">
            <span className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">
                Próximas execuções (continua repetindo)
            </span>
            {occurrences === null ? (
                <p className="text-white text-sm">
                    Personalizada (regras avançadas) — datas exibidas conforme execução.
                </p>
            ) : occurrences.length === 0 ? (
                <p className="text-[#92bbc9] text-sm italic">
                    Nenhuma ocorrência dentro do período visível.
                </p>
            ) : (
                <>
                    <ul className="flex flex-col gap-1">
                        {occurrences.map((o) => (
                            <li key={o.dateKey} className="text-white text-sm font-medium">
                                {formatOccurrence(o, includeYear)}
                            </li>
                        ))}
                    </ul>
                    <p className="text-[#92bbc9] text-xs italic mt-2">
                        Mostrando apenas as próximas datas com base na configuração.
                    </p>
                </>
            )}
        </div>
    );
}
