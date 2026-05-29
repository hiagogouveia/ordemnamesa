"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    useReceivingExecutions,
    type ReceivingExecutionStatusFilter,
} from "@/lib/hooks/use-receiving-executions";

interface ExecucoesViewProps {
    restaurantId: string | undefined;
}

const STATUS_OPTIONS: Array<{ value: ReceivingExecutionStatusFilter; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "in_progress", label: "Em execução" },
    { value: "completed", label: "Concluídos" },
];

function formatDateTime(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * Aba "Execuções" em /checklists — execuções operacionais de recebimento.
 * Inclui execuções instanciadas via templates (Etapa 2+) e instâncias
 * one-shot legacy.
 *
 * Etapa 4: consome /api/receiving/executions (rename do antigo
 * /api/receiving/quick/history).
 */
export function ExecucoesView({ restaurantId }: ExecucoesViewProps) {
    const router = useRouter();
    const [statusFilter, setStatusFilter] = useState<ReceivingExecutionStatusFilter>("all");

    const { data: items = [], isLoading, isError } = useReceivingExecutions(
        restaurantId,
        { days: 1, status: statusFilter },
    );

    return (
        <div className="flex flex-col gap-3 px-4 py-4">
            {/* Sub-filtros */}
            <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[#92bbc9] text-xs mr-1">Filtrar:</span>
                {STATUS_OPTIONS.map((s) => {
                    const isActive = statusFilter === s.value;
                    return (
                        <button
                            key={s.value}
                            type="button"
                            onClick={() => setStatusFilter(s.value)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                                isActive
                                    ? "bg-[#13b6ec]/15 border border-[#13b6ec]/40 text-[#13b6ec]"
                                    : "bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]"
                            }`}
                        >
                            {s.label}
                        </button>
                    );
                })}
                <span className="ml-auto text-[#5a8a99] text-[11px]">Últimos 30 dias</span>
            </div>

            {/* Estados: loading / error / empty / lista */}
            {isLoading ? (
                <div className="text-[#92bbc9] text-sm py-2">Carregando…</div>
            ) : isError ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
                    Erro ao carregar execuções. Tente novamente.
                </div>
            ) : items.length === 0 ? (
                <div className="bg-[#1a2c32] border border-dashed border-[#233f48] rounded-xl p-6 text-center text-[#92bbc9] text-sm">
                    Nenhuma execução nos últimos 30 dias.
                </div>
            ) : (
                <ul className="flex flex-col gap-3">
                    {items.map((q) => {
                        const isCompleted = q.completed_at !== null;
                        return (
                            <li
                                key={q.checklist_id}
                                className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-4 flex flex-col gap-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-white font-bold text-sm truncate">{q.name}</h3>
                                            {!q.source_template_id && (
                                                <span
                                                    className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider"
                                                    title="Recebimento legado (sem modelo)"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">bolt</span>
                                                    Legado
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#92bbc9] mt-1">
                                            <span>{q.supplier?.name || "Fornecedor não informado"}</span>
                                            {q.area && (
                                                <span className="flex items-center gap-1">
                                                    • <span className="size-2 rounded-full" style={{ background: q.area.color }} />
                                                    {q.area.name}
                                                </span>
                                            )}
                                            {q.assumed_by_user_name && <span>• Executado por {q.assumed_by_user_name}</span>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5a8a99] mt-1">
                                            <span>Criado: {formatDateTime(q.created_at)}</span>
                                            {q.assumed_at && <span>• Iniciado: {formatDateTime(q.assumed_at)}</span>}
                                            {q.completed_at && <span>• Concluído: {formatDateTime(q.completed_at)}</span>}
                                            <span>
                                                • {q.tasks_completed}/{q.tasks_total} tarefas
                                            </span>
                                        </div>
                                    </div>
                                    <span
                                        className={`shrink-0 px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
                                            isCompleted
                                                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                                                : "bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]"
                                        }`}
                                    >
                                        {isCompleted ? "Concluído" : "Em execução"}
                                    </span>
                                </div>
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => router.push(`/turno/atividade/${q.checklist_id}`)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#16262c] border border-[#233f48] text-[#92bbc9] text-xs font-bold hover:bg-[#233f48] hover:text-white transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                                        Ver detalhes
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
