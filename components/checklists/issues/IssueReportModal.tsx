"use client";

import { useState } from "react";
import { useReportIssue } from "@/lib/hooks/use-task-issues";
import { uploadEvidencePhoto } from "@/lib/supabase/storage";

interface IssueReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
    restaurantId: string;
    taskId: string;
    taskTitle?: string;
    checklistId: string;
    checklistAssumptionId?: string | null;
    taskExecutionId?: string | null;
}

export function IssueReportModal({
    isOpen,
    onClose,
    onCreated,
    restaurantId,
    taskId,
    taskTitle,
    checklistId,
    checklistAssumptionId,
    taskExecutionId,
}: IssueReportModalProps) {
    const [description, setDescription] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const reportIssue = useReportIssue();

    if (!isOpen) return null;

    const handleSubmit = async () => {
        const trimmed = description.trim();
        if (trimmed.length < 3) {
            setError("Descreva o problema (mínimo 3 caracteres).");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const photoPaths: string[] = [];
            for (const f of files) {
                const path = await uploadEvidencePhoto(f, restaurantId, taskId);
                photoPaths.push(path);
            }
            await reportIssue.mutateAsync({
                restaurant_id: restaurantId,
                task_id: taskId,
                checklist_id: checklistId,
                checklist_assumption_id: checklistAssumptionId ?? null,
                task_execution_id: taskExecutionId ?? null,
                description: trimmed,
                photos: photoPaths,
            });
            setDescription("");
            setFiles([]);
            onCreated?.();
            onClose();
        } catch (e) {
            setError((e as Error).message || "Erro ao registrar ocorrência");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full sm:max-w-md bg-[#101d22] rounded-t-2xl sm:rounded-2xl border border-[#233f48] shadow-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#233f48] flex items-center justify-between">
                    <div>
                        <h2 className="text-white font-semibold">Registrar ocorrência</h2>
                        {taskTitle && <p className="text-xs text-[#92bbc9] mt-0.5 line-clamp-1">{taskTitle}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="text-[#92bbc9] hover:text-white text-2xl leading-none disabled:opacity-40"
                        aria-label="Fechar"
                    >×</button>
                </div>

                <div className="p-4 flex flex-col gap-4">
                    <div>
                        <label className="text-xs text-[#92bbc9] block mb-1.5">
                            Descrição <span className="text-amber-400">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Ex: Equipamento quebrado, falta de insumo, problema de higiene..."
                            rows={4}
                            disabled={submitting}
                            className="w-full bg-[#0c1518] border border-[#233f48] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#5d7a83] focus:outline-none focus:border-[#13b6ec] disabled:opacity-50 resize-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-[#92bbc9] block mb-1.5">
                            Fotos (opcional)
                        </label>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/jpg"
                            multiple
                            disabled={submitting}
                            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                            className="block w-full text-xs text-[#92bbc9] file:mr-2 file:rounded-md file:border-0 file:bg-[#13b6ec]/10 file:text-[#13b6ec] file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-[#13b6ec]/20"
                        />
                        {files.length > 0 && (
                            <p className="text-[11px] text-[#92bbc9] mt-1.5">
                                {files.length} arquivo{files.length > 1 ? "s" : ""} selecionado{files.length > 1 ? "s" : ""}
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-xs text-red-400">
                            {error}
                        </div>
                    )}

                    <p className="text-[11px] text-[#92bbc9]/70">
                        A ocorrência será enviada para o gestor. A tarefa pode ser concluída normalmente.
                    </p>
                </div>

                <div className="p-4 border-t border-[#233f48] flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 py-2.5 rounded-lg border border-[#325a67] text-sm text-[#92bbc9] hover:bg-[#1a2c32] disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || description.trim().length < 3}
                        className="flex-1 py-2.5 rounded-lg bg-amber-500 text-[#0c1518] text-sm font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {submitting ? "Enviando..." : "Registrar"}
                    </button>
                </div>
            </div>
        </div>
    );
}
