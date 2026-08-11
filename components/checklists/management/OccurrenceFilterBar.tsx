"use client";

/**
 * Sprint 96 — seletor de OCORRÊNCIA PREVISTA das rotinas.
 *
 * Responde "o que será executado nesta data/período?", nunca "quais rotinas têm
 * alguma informação nesta data". Quem decide isso é `occursInRange`, no domínio —
 * este componente só escolhe o filtro e mostra o período resolvido.
 *
 * Mobile-first: a linha de chips rola horizontalmente com snap, mesmo padrão de
 * `app/(app)/turno/page.tsx`. O calendário é um `<input type="date">` nativo, o
 * que entrega o date picker do iOS/Android sem dependência nova.
 */

import { useEffect, useRef, useState } from "react";
import {
    dateFilter,
    filterDateKey,
    type OccurrenceFilter,
} from "@/lib/utils/recurrence/occurrence-window";

/** Rótulos curtos dos chips de dia da semana. Índice = `dow` (0=domingo). */
const WEEKDAY_CHIPS: ReadonlyArray<{ filter: OccurrenceFilter; label: string; full: string }> = [
    { filter: "dow-0", label: "Dom", full: "domingo" },
    { filter: "dow-1", label: "Seg", full: "segunda-feira" },
    { filter: "dow-2", label: "Ter", full: "terça-feira" },
    { filter: "dow-3", label: "Qua", full: "quarta-feira" },
    { filter: "dow-4", label: "Qui", full: "quinta-feira" },
    { filter: "dow-5", label: "Sex", full: "sexta-feira" },
    { filter: "dow-6", label: "Sáb", full: "sábado" },
];

interface OccurrenceFilterBarProps {
    value: OccurrenceFilter;
    onChange: (value: OccurrenceFilter) => void;
    /** Rótulo do período resolvido (ex.: "Rotinas de hoje — terça-feira, 11 de agosto"). */
    periodLabel: string | null;
    /** Quantidade de rotinas previstas — só exibida quando há período selecionado. */
    resultCount?: number;
    /**
     * Visão global: `useShifts` fica desabilitada e o fuso cai no padrão de São
     * Paulo, então a previsão por dia é aproximada. Melhor avisar do que mentir.
     */
    isGlobal?: boolean;
}

export function OccurrenceFilterBar({
    value,
    onChange,
    periodLabel,
    resultCount,
    isGlobal,
}: OccurrenceFilterBarProps) {
    const selectedDate = filterDateKey(value);
    const dateInputRef = useRef<HTMLInputElement>(null);
    // Só habilita o input de data depois da montagem: o calendário nativo não
    // participa do HTML do servidor e evitamos qualquer divergência de hidratação.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const openDatePicker = () => {
        const el = dateInputRef.current;
        if (!el) return;
        // `showPicker` abre o calendário direto; nem todo browser implementa.
        if (typeof el.showPicker === "function") {
            try {
                el.showPicker();
                return;
            } catch {
                /* cai no focus abaixo */
            }
        }
        el.focus();
        el.click();
    };

    return (
        <div className="shrink-0 px-4 py-2.5 border-b border-[#233f48] bg-[#0a1215]">
            <div
                role="group"
                aria-label="Ocorrência prevista"
                className="flex items-center overflow-x-auto gap-1.5 -mx-1 px-1 pb-1 scrollbar-hide snap-x"
            >
                <Pill active={value === ""} onClick={() => onChange("")} label="Todas as rotinas">
                    Todas
                </Pill>

                <span aria-hidden className="shrink-0 w-px h-5 bg-[#233f48] mx-0.5" />

                <Pill
                    active={value === "today"}
                    onClick={() => onChange("today")}
                    label="Rotinas previstas para hoje"
                >
                    Hoje
                </Pill>
                <Pill
                    active={value === "tomorrow"}
                    onClick={() => onChange("tomorrow")}
                    label="Rotinas previstas para amanhã"
                >
                    Amanhã
                </Pill>

                <span aria-hidden className="shrink-0 w-px h-5 bg-[#233f48] mx-0.5" />

                {WEEKDAY_CHIPS.map((d) => (
                    <Pill
                        key={d.filter}
                        active={value === d.filter}
                        onClick={() => onChange(d.filter)}
                        label={`Rotinas previstas para a próxima ${d.full}`}
                    >
                        {d.label}
                    </Pill>
                ))}

                <span aria-hidden className="shrink-0 w-px h-5 bg-[#233f48] mx-0.5" />

                <Pill
                    active={value === "week"}
                    onClick={() => onChange("week")}
                    label="Rotinas previstas para esta semana"
                >
                    Esta semana
                </Pill>
                <Pill
                    active={value === "month"}
                    onClick={() => onChange("month")}
                    label="Rotinas previstas para este mês"
                >
                    Este mês
                </Pill>

                <span aria-hidden className="shrink-0 w-px h-5 bg-[#233f48] mx-0.5" />

                {/* Data específica — permite inclusive olhar dias já passados,
                    que os chips de dia da semana (forward-only) não alcançam. */}
                <div className="relative shrink-0 snap-start">
                    <button
                        type="button"
                        onClick={openDatePicker}
                        disabled={!mounted}
                        aria-pressed={Boolean(selectedDate)}
                        aria-label="Escolher uma data específica no calendário"
                        title="Escolher uma data específica"
                        className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                            selectedDate
                                ? "bg-[#13b6ec] text-[#0f1b21]"
                                : "bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]"
                        }`}
                    >
                        <CalendarIcon />
                        {selectedDate ? formatChipDate(selectedDate) : "Data"}
                    </button>
                    <input
                        ref={dateInputRef}
                        type="date"
                        value={selectedDate ?? ""}
                        onChange={(e) => onChange(e.target.value ? dateFilter(e.target.value) : "")}
                        tabIndex={-1}
                        aria-hidden
                        // Fica sob o botão: invisível, mas ancorado, para que o
                        // calendário nativo apareça na posição certa.
                        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none [color-scheme:dark]"
                    />
                </div>

                {value !== "" && (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        aria-label="Limpar filtro de ocorrência"
                        className="shrink-0 snap-start flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors"
                    >
                        <XIcon />
                        Limpar
                    </button>
                )}
            </div>

            {periodLabel && (
                <p
                    aria-live="polite"
                    className="mt-1.5 px-0.5 text-xs text-[#92bbc9] flex flex-wrap items-center gap-x-2 gap-y-0.5"
                >
                    <span className="font-semibold text-white">{periodLabel}</span>
                    {typeof resultCount === "number" && (
                        <span>
                            {resultCount} {resultCount === 1 ? "rotina prevista" : "rotinas previstas"}
                        </span>
                    )}
                    {isGlobal && (
                        <span className="text-[#557682]">
                            · previsão aproximada na visão global (turnos e fuso por unidade não
                            são considerados)
                        </span>
                    )}
                </p>
            )}
        </div>
    );
}

function Pill({
    active,
    onClick,
    label,
    children,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            aria-label={label}
            className={`shrink-0 snap-start whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                active
                    ? "bg-[#13b6ec] text-[#0f1b21]"
                    : "bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]"
            }`}
        >
            {children}
        </button>
    );
}

/* Ícones inline — o projeto não usa biblioteca de ícones. */

function CalendarIcon() {
    return (
        <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

/** `2026-08-15` → `15/08`. Lexical, sem `new Date` (evita o off-by-one de UTC). */
function formatChipDate(dateKey: string): string {
    const [, month, day] = dateKey.split("-");
    return `${day}/${month}`;
}
