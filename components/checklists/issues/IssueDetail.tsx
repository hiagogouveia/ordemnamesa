"use client";

import { useEffect, useState } from "react";
import type { TaskIssue, TaskIssueStatus } from "@/lib/types";
import { useIssueTimeline, useUpdateIssue } from "@/lib/hooks/use-task-issues";
import { getPhotoSignedUrl } from "@/lib/supabase/storage";

const STATUS_OPTIONS: { value: TaskIssueStatus; label: string; cls: string }[] = [
    { value: "open", label: "Aberta", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
    { value: "investigating", label: "Em análise", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
    { value: "resolved", label: "Resolvida", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
];

interface IssueDetailProps {
    issue: TaskIssue;
    canManage: boolean;
    taskTitle?: string;
    reporterName?: string;
}

export function IssueDetail({ issue, canManage, taskTitle, reporterName }: IssueDetailProps) {
    const { data: events } = useIssueTimeline(issue.id);
    const update = useUpdateIssue();
    const [comment, setComment] = useState("");
    const [pendingStatus, setPendingStatus] = useState<TaskIssueStatus>(issue.status);
    const [error, setError] = useState<string | null>(null);
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        setPendingStatus(issue.status);
        setComment("");
        setError(null);
    }, [issue.id, issue.status]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const entries: Record<string, string> = {};
            for (const path of issue.photos) {
                const url = await getPhotoSignedUrl(path);
                if (url) entries[path] = url;
            }
            if (!cancelled) setPhotoUrls(entries);
        })();
        return () => { cancelled = true; };
    }, [issue.photos]);

    const handleApply = async () => {
        setError(null);
        try {
            const statusChanged = pendingStatus !== issue.status;
            const commentTrimmed = comment.trim();
            if (!statusChanged && commentTrimmed.length === 0) {
                setError("Altere o status ou adicione um comentário.");
                return;
            }
            if (pendingStatus === "resolved" && commentTrimmed.length === 0 && !issue.manager_comment) {
                setError("Adicione um comentário ao resolver a ocorrência.");
                return;
            }
            await update.mutateAsync({
                id: issue.id,
                restaurantId: issue.restaurant_id,
                status: statusChanged ? pendingStatus : undefined,
                manager_comment: commentTrimmed.length > 0 ? commentTrimmed : undefined,
            });
            setComment("");
        } catch (e) {
            setError((e as Error).message || "Erro ao atualizar");
        }
    };

    const currentStyle = STATUS_OPTIONS.find(s => s.value === issue.status)!;

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white line-clamp-2">{taskTitle ?? "Tarefa"}</h3>
                    <p className="text-[11px] text-[#92bbc9] mt-0.5">
                        {reporterName ?? "Colaborador"} · {new Date(issue.created_at).toLocaleString("pt-BR")}
                    </p>
                </div>
                <span className={`text-[10px] uppercase tracking-wide font-bold rounded-full border px-2 py-1 whitespace-nowrap ${currentStyle.cls}`}>
                    {currentStyle.label}
                </span>
            </header>

            <section>
                <p className="text-sm text-white whitespace-pre-wrap">{issue.description}</p>
            </section>

            {issue.photos.length > 0 && (
                <section>
                    <p className="text-[11px] uppercase tracking-wide font-bold text-[#92bbc9] mb-1.5">Fotos</p>
                    <div className="flex flex-wrap gap-2">
                        {issue.photos.map((p) => (
                            <a key={p} href={photoUrls[p]} target="_blank" rel="noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden bg-[#0c1518] border border-[#233f48]">
                                {photoUrls[p] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={photoUrls[p]} alt="evidência" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#5d7a83] text-[10px]">…</div>
                                )}
                            </a>
                        ))}
                    </div>
                </section>
            )}

            {issue.manager_comment && (
                <section className="rounded-lg bg-[#0c1518] border border-[#233f48] p-3">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-[#92bbc9] mb-1">Comentário do gestor</p>
                    <p className="text-xs text-white whitespace-pre-wrap">{issue.manager_comment}</p>
                </section>
            )}

            {canManage && (
                <section className="rounded-lg bg-[#0c1518] border border-[#233f48] p-3 flex flex-col gap-2.5">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-[#92bbc9]">Tratar ocorrência</p>
                    <div className="flex flex-wrap gap-1.5">
                        {STATUS_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setPendingStatus(opt.value)}
                                className={`text-[11px] font-medium rounded-full border px-2.5 py-1 ${
                                    pendingStatus === opt.value ? opt.cls : "bg-transparent border-[#325a67] text-[#92bbc9]"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={pendingStatus === "resolved" ? "Comentário (obrigatório ao resolver)" : "Adicionar comentário (opcional)"}
                        rows={3}
                        className="w-full bg-[#101d22] border border-[#233f48] rounded-md px-2.5 py-2 text-xs text-white placeholder:text-[#5d7a83] resize-none focus:outline-none focus:border-[#13b6ec]"
                    />
                    {error && <p className="text-[11px] text-red-400">{error}</p>}
                    <button
                        onClick={handleApply}
                        disabled={update.isPending}
                        className="self-end bg-[#13b6ec] text-[#0c1518] text-xs font-semibold rounded-md px-3 py-1.5 hover:bg-[#13b6ec]/90 disabled:opacity-50"
                    >
                        {update.isPending ? "Salvando..." : "Salvar"}
                    </button>
                </section>
            )}

            <section>
                <p className="text-[11px] uppercase tracking-wide font-bold text-[#92bbc9] mb-1.5">Timeline</p>
                <ol className="flex flex-col gap-1.5">
                    {(events ?? []).map(ev => (
                        <li key={ev.id} className="text-[11px] text-[#92bbc9] flex gap-2">
                            <span className="text-[#5d7a83]">
                                {new Date(ev.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                            <span className="text-white">
                                {ev.event_type === "created" && "Criada"}
                                {ev.event_type === "status_changed" && `Status: ${ev.from_status} → ${ev.to_status}`}
                                {ev.event_type === "comment_added" && "Comentário adicionado"}
                                {ev.event_type === "resolved" && "Resolvida"}
                                {ev.event_type === "reopened" && "Reaberta"}
                                {ev.event_type === "edited" && "Editada pelo autor"}
                            </span>
                            {ev.comment && <span className="text-[#92bbc9]">— {ev.comment}</span>}
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}
