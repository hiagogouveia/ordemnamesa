"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getPhotoSignedUrl } from "@/lib/supabase/storage";
import { ChecklistForm } from "@/components/checklists/checklist-form";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import { getBrazilDateKey } from "@/lib/utils/brazil-date";

const SHIFT_LABELS: Record<string, string> = {
    morning: "Manhã",
    afternoon: "Tarde",
    evening: "Noite",
    any: "Todos os turnos",
};

const RECURRENCE_LABELS: Record<string, string> = {
    daily: "Diária",
    weekly: "Semanal",
    monthly: "Mensal",
    yearly: "Anual",
    weekdays: "Dias úteis",
    custom: "Personalizada",
    shift_days: "Dias do turno",
};

const TYPE_LABELS: Record<string, string> = {
    regular: "Regular",
    opening: "Abertura",
    closing: "Fechamento",
    receiving: "Recebimento",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskExecution {
    id: string;
    task_id: string;
    status: string;
    photo_url: string | null;
    executed_at: string;
}

interface AssumptionDetail {
    user_name: string | null;
    observation: string | null;
    completed_at: string | null;
    execution_status: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useChecklistExecutions(checklistId: string, restaurantId: string) {
    return useQuery({
        queryKey: ["checklist-executions-panel", checklistId],
        queryFn: async (): Promise<TaskExecution[]> => {
            const supabase = createClient();
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data } = await supabase
                .from("task_executions")
                .select("id, task_id, status, photo_url, executed_at")
                .eq("checklist_id", checklistId)
                .eq("restaurant_id", restaurantId)
                .gte("executed_at", todayStart.toISOString());

            return data ?? [];
        },
        enabled: !!checklistId && !!restaurantId,
    });
}

function useAssumptionDetail(checklistId: string, restaurantId: string) {
    return useQuery({
        queryKey: ["checklist-assumption-panel", checklistId],
        queryFn: async (): Promise<AssumptionDetail | null> => {
            const supabase = createClient();
            const dateKey = getBrazilDateKey();

            const { data } = await supabase
                .from("checklist_assumptions")
                .select("user_name, observation, completed_at, execution_status")
                .eq("checklist_id", checklistId)
                .eq("restaurant_id", restaurantId)
                .eq("date_key", dateKey)
                .maybeSingle();

            return data;
        },
        enabled: !!checklistId && !!restaurantId,
    });
}

// ── Photo Modal ───────────────────────────────────────────────────────────────

interface PhotoModalProps {
    photoUrl: string;
    taskTitle: string;
    onClose: () => void;
}

function PhotoModal({ photoUrl, taskTitle, onClose }: PhotoModalProps) {
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
            onClick={onClose}
        >
            <div
                className="relative max-w-2xl w-full flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute -top-4 right-0 size-9 flex items-center justify-center rounded-full bg-[#1a2c32] border border-[#325a67] text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors z-10"
                >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>

                <div
                    className="relative w-full rounded-xl overflow-hidden flex items-center justify-center bg-black/40"
                    style={{ maxHeight: "70vh", minHeight: "200px" }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={photoUrl}
                        alt={taskTitle}
                        className="max-w-full max-h-[70vh] object-contain"
                        onError={(e) => { e.currentTarget.src = '/image-error-placeholder.png'; }}
                    />
                </div>

                <div className="bg-[#16262c] border border-[#325a67] rounded-xl px-5 py-3">
                    <p className="text-white font-bold text-sm">{taskTitle}</p>
                    <p className="text-[#92bbc9] text-xs mt-0.5">Evidência fotográfica</p>
                </div>
            </div>
        </div>
    );
}

// ── ChecklistViewPanel ────────────────────────────────────────────────────────

interface ChecklistViewPanelProps {
    checklist: ExtendedChecklist;
    restaurantId?: string;
    onEdit: () => void;
    onClose: () => void;
}

function ChecklistViewPanel({ checklist, restaurantId, onEdit, onClose }: ChecklistViewPanelProps) {
    const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

    const { data: executions = [], isLoading: execLoading } = useChecklistExecutions(
        checklist.id,
        restaurantId ?? ""
    );

    // Resolve signed URLs para todas as execuções com foto
    useEffect(() => {
        const photoPaths = executions.filter((e) => e.photo_url).map((e) => ({ id: e.task_id, path: e.photo_url! }));
        if (photoPaths.length === 0) return;

        let cancelled = false;
        Promise.all(
            photoPaths.map(async ({ id, path }) => {
                const url = await getPhotoSignedUrl(path);
                return { id, url };
            })
        ).then((results) => {
            if (cancelled) return;
            const map: Record<string, string> = {};
            for (const { id, url } of results) {
                if (url) map[id] = url;
            }
            setSignedUrls(map);
        });

        return () => { cancelled = true; };
    }, [executions]);

    const { data: assumptionDetail } = useAssumptionDetail(
        checklist.id,
        restaurantId ?? ""
    );

    const executionMap = new Map(executions.map((e) => [e.task_id, e]));
    const hasExecution = executions.length > 0 || !!assumptionDetail;
    const hasPhotos = executions.some((e) => !!e.photo_url);

    const statusLabel: Record<string, string> = {
        done: "Concluída",
        in_progress: "Em andamento",
        blocked: "Com impedimento",
        not_started: "Não iniciada",
    };

    const statusColor: Record<string, string> = {
        done: "text-emerald-400",
        in_progress: "text-[#13b6ec]",
        blocked: "text-amber-400",
        not_started: "text-[#92bbc9]",
    };

    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-[#233f48] shrink-0">
                <div className="flex-1 min-w-0 pr-3">
                    <h2 className="text-white font-bold text-base leading-snug">{checklist.name}</h2>
                    <div className="flex items-center flex-wrap gap-2 mt-1.5">
                        {checklist.area && (
                            <span className="flex items-center gap-1">
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: checklist.area.color || "#325a67" }}
                                />
                                <span className="text-[#92bbc9] text-xs">{checklist.area.name}</span>
                            </span>
                        )}
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                checklist.active
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                    : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            }`}
                        >
                            {checklist.active ? "Ativo" : "Inativo"}
                        </span>
                        {checklist.status === "draft" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">
                                Rascunho
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#233f48] text-[#92bbc9] hover:text-white transition-colors shrink-0"
                >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">

                {/* ── Execução de hoje ───────────────────────────────────────── */}
                {restaurantId && hasExecution && (
                    <div className="p-4 border-b border-[#1a2c32]">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">
                                Execução de hoje
                            </p>
                            {assumptionDetail?.execution_status && (
                                <span className={`text-xs font-bold ${statusColor[assumptionDetail.execution_status] ?? "text-[#92bbc9]"}`}>
                                    {statusLabel[assumptionDetail.execution_status] ?? assumptionDetail.execution_status}
                                </span>
                            )}
                        </div>

                        {/* Executor */}
                        {assumptionDetail?.user_name && (
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-7 h-7 rounded-full bg-[#13b6ec]/20 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px]">person</span>
                                </div>
                                <div>
                                    <p className="text-white text-sm font-medium">{assumptionDetail.user_name}</p>
                                    {assumptionDetail.completed_at && (
                                        <p className="text-[#92bbc9] text-xs">
                                            Concluída às{" "}
                                            {new Date(assumptionDetail.completed_at).toLocaleTimeString("pt-BR", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Observação */}
                        {assumptionDetail?.observation && (
                            <div className="bg-[#1a2c32] border border-[#325a67] rounded-xl p-3 mb-3">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="material-symbols-outlined text-[#92bbc9] text-[14px]">chat</span>
                                    <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">Observação</p>
                                </div>
                                <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">
                                    {assumptionDetail.observation}
                                </p>
                            </div>
                        )}

                        {/* Badge de fotos enviadas */}
                        {hasPhotos && (
                            <div className="flex items-center gap-1.5 text-[#13b6ec] text-xs font-semibold mb-2">
                                <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                                {executions.filter((e) => e.photo_url).length}{" "}
                                {executions.filter((e) => e.photo_url).length === 1
                                    ? "foto enviada"
                                    : "fotos enviadas"}
                            </div>
                        )}

                        {/* Loading execuções */}
                        {execLoading && (
                            <div className="flex justify-center py-4">
                                <span className="material-symbols-outlined animate-spin text-xl text-[#13b6ec]">
                                    progress_activity
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Informações básicas */}
                {checklist.description && (
                    <div className="p-4 border-b border-[#1a2c32]">
                        <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide mb-2">Descrição</p>
                        <p className="text-white text-sm leading-relaxed">{checklist.description}</p>
                    </div>
                )}

                {/* Configuração */}
                <div className="p-4 border-b border-[#1a2c32]">
                    <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide mb-3">Configuração</p>
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Turno</span>
                            <span className="text-white text-sm font-medium">
                                {SHIFT_LABELS[checklist.shift] ?? checklist.shift}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Recorrência</span>
                            <span className="text-white text-sm font-medium">
                                {RECURRENCE_LABELS[checklist.recurrence ?? "daily"] ?? "—"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Tipo</span>
                            <span className="text-white text-sm font-medium">
                                {TYPE_LABELS[checklist.checklist_type ?? "regular"] ?? "—"}
                            </span>
                        </div>
                        {checklist.area && (
                            <div className="flex items-center justify-between">
                                <span className="text-[#92bbc9] text-sm">Área</span>
                                <span className="flex items-center gap-1.5 text-white text-sm font-medium">
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: checklist.area.color || "#325a67" }}
                                    />
                                    {checklist.area.name}
                                </span>
                            </div>
                        )}
                        {checklist.responsible?.name && (
                            <div className="flex items-center justify-between">
                                <span className="text-[#92bbc9] text-sm">Responsável</span>
                                <span className="text-white text-sm font-medium">
                                    {checklist.responsible.name}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Tarefas (com status de execução e fotos) ──────────────── */}
                <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">Tarefas</p>
                        <span className="text-[#325a67] text-xs">
                            {checklist.tasks?.length ?? 0}{" "}
                            {(checklist.tasks?.length ?? 0) === 1 ? "tarefa" : "tarefas"}
                        </span>
                    </div>

                    {!checklist.tasks || checklist.tasks.length === 0 ? (
                        <div className="text-center py-8">
                            <span className="material-symbols-outlined text-3xl text-[#325a67]">checklist</span>
                            <p className="text-[#92bbc9] text-sm mt-2">Nenhuma tarefa cadastrada</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {[...checklist.tasks]
                                .sort((a, b) => a.order - b.order)
                                .map((task, idx) => {
                                    const execution = executionMap.get(task.id);
                                    const isDone = execution?.status === "done";
                                    const photoUrl = signedUrls[task.id] ?? null;

                                    return (
                                        <div
                                            key={task.id}
                                            className={`flex items-start gap-3 p-3 border rounded-xl transition-colors ${
                                                isDone
                                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                                    : "bg-[#0a1215] border-[#233f48]"
                                            }`}
                                        >
                                            {/* Status icon */}
                                            <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                                                <span
                                                    className={`text-xs font-bold w-5 text-right ${
                                                        isDone ? "text-emerald-400" : "text-[#325a67]"
                                                    }`}
                                                >
                                                    {isDone ? (
                                                        <span className="material-symbols-outlined text-[16px] text-emerald-400">
                                                            check_circle
                                                        </span>
                                                    ) : (
                                                        <span className="text-[#325a67]">{idx + 1}</span>
                                                    )}
                                                </span>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p
                                                    className={`text-sm font-medium leading-snug ${
                                                        isDone ? "text-emerald-300" : "text-white"
                                                    }`}
                                                >
                                                    {task.title}
                                                </p>
                                                {task.description && (
                                                    <p className="text-[#92bbc9] text-xs mt-0.5">{task.description}</p>
                                                )}
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    {task.requires_photo && !isDone && (
                                                        <span className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
                                                            <span className="material-symbols-outlined text-[12px]">
                                                                photo_camera
                                                            </span>
                                                            Foto obrigatória
                                                        </span>
                                                    )}
                                                    {task.is_critical && (
                                                        <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold">
                                                            <span className="material-symbols-outlined text-[12px]">
                                                                priority_high
                                                            </span>
                                                            Crítica
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Thumbnail da foto */}
                                                {photoUrl && (
                                                    <button
                                                        onClick={() =>
                                                            setSelectedPhoto({ url: photoUrl, title: task.title })
                                                        }
                                                        className="mt-2 block relative w-full max-w-[120px] h-16 rounded-lg overflow-hidden border border-[#13b6ec]/30 hover:border-[#13b6ec] transition-colors group"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={photoUrl}
                                                            alt={task.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-white text-[18px] opacity-0 group-hover:opacity-100 transition-opacity">
                                                                zoom_in
                                                            </span>
                                                        </div>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#233f48] shrink-0">
                <button
                    onClick={onEdit}
                    className="w-full flex items-center justify-center gap-2 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-sm py-3 rounded-xl transition-colors"
                >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Editar rotina
                </button>
            </div>

            {/* Photo modal */}
            {selectedPhoto && (
                <PhotoModal
                    photoUrl={selectedPhoto.url}
                    taskTitle={selectedPhoto.title}
                    onClose={() => setSelectedPhoto(null)}
                />
            )}
        </div>
    );
}

// ── ChecklistEditorPanel (exported) ──────────────────────────────────────────

export interface ChecklistEditorPanelProps {
    checklist: ExtendedChecklist | null;
    mode: "view" | "edit" | "new";
    onModeChange: (mode: "view" | "edit" | "new") => void;
    onClose: () => void;
    onSaved: () => void;
    restaurantId?: string;
}

export function ChecklistEditorPanel({
    checklist,
    mode,
    onModeChange,
    onClose,
    onSaved,
    restaurantId,
}: ChecklistEditorPanelProps) {
    if (mode === "view" && checklist) {
        return (
            <ChecklistViewPanel
                checklist={checklist}
                restaurantId={restaurantId}
                onEdit={() => onModeChange("edit")}
                onClose={onClose}
            />
        );
    }

    return (
        <div className="h-full overflow-hidden flex flex-col">
            <ChecklistForm checklist={checklist} onSaved={onSaved} onCancel={onClose} />
        </div>
    );
}
