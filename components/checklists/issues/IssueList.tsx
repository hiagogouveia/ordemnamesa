"use client";

import { useState } from "react";
import type { TaskIssue, TaskIssueStatus } from "@/lib/types";

const STATUS_STYLE: Record<TaskIssueStatus, { label: string; cls: string }> = {
    open: { label: "Aberta", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
    investigating: { label: "Em análise", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
    resolved: { label: "Resolvida", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
};

interface IssueListProps {
    issues: TaskIssue[];
    selectedId?: string | null;
    onSelect: (issue: TaskIssue) => void;
    taskTitleById?: Record<string, string>;
    /** s90 — a ocorrência apontada pelo deep-link: recebe scroll + destaque. */
    focusedIssueId?: string | null;
    /** Callback ref do item focado. Dispara o scroll no instante em que o nó MONTA. */
    focusedRef?: (node: HTMLDivElement | null) => void;
}

export function IssueList({
    issues,
    selectedId,
    onSelect,
    taskTitleById,
    focusedIssueId,
    focusedRef,
}: IssueListProps) {
    // O destaque é uma animação CSS que se apaga sozinha. `onAnimationEnd` limpa o
    // estado — nenhum setTimeout envolvido, nem para o scroll nem para o realce.
    const [flashDone, setFlashDone] = useState(false);

    if (issues.length === 0) {
        return (
            <div className="text-center py-6 text-xs text-[#92bbc9]">
                Nenhuma ocorrência registrada.
            </div>
        );
    }

    return (
        <ul className="flex flex-col gap-2">
            {issues.map((issue) => {
                const style = STATUS_STYLE[issue.status];
                const isSelected = selectedId === issue.id;
                const isFocused = focusedIssueId === issue.id;
                const shouldFlash = isFocused && !flashDone;
                const title = taskTitleById?.[issue.task_id] ?? "Tarefa";

                return (
                    <li key={issue.id}>
                        <div
                            // Âncora estável por ocorrência — antes não havia id no DOM,
                            // então era impossível ancorar num item específico.
                            id={`issue-${issue.id}`}
                            ref={isFocused ? focusedRef : undefined}
                            onAnimationEnd={() => setFlashDone(true)}
                            className={shouldFlash ? "animate-notification-flash rounded-lg" : ""}
                        >
                            <button
                                onClick={() => onSelect(issue)}
                                aria-current={isFocused ? "true" : undefined}
                                className={`w-full text-left rounded-lg border p-3 transition ${
                                    isSelected
                                        ? "bg-[#1a2c32] border-[#13b6ec]"
                                        : "bg-[#0c1518] border-[#233f48] hover:border-[#325a67]"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <span className="text-sm text-white font-medium line-clamp-1 flex-1">{title}</span>
                                    <span className={`text-[10px] uppercase tracking-wide font-bold rounded-full border px-2 py-0.5 ${style.cls}`}>
                                        {style.label}
                                    </span>
                                </div>
                                <p className="text-xs text-[#92bbc9] line-clamp-2">{issue.description}</p>
                                <div className="mt-2 flex items-center gap-3 text-[10px] text-[#5d7a83]">
                                    <span>{new Date(issue.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                                    {issue.photos.length > 0 && (
                                        <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">image</span>
                                            {issue.photos.length}
                                        </span>
                                    )}
                                </div>
                            </button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
