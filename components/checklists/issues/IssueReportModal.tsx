"use client";

import { useEffect, useState } from "react";
import { useReportIssue, useUpdateIssue } from "@/lib/hooks/use-task-issues";
import { uploadEvidencePhoto, getPhotoSignedUrl } from "@/lib/supabase/storage";
import type { TaskIssue } from "@/lib/types";

type Mode = "create" | "edit";

interface IssueReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
    onUpdated?: () => void;
    restaurantId: string;
    taskId: string;
    taskTitle?: string;
    checklistId: string;
    checklistAssumptionId?: string | null;
    taskExecutionId?: string | null;
    /** Sprint 46: quando preenchido, modal entra em modo edição */
    existingIssue?: TaskIssue | null;
}

export function IssueReportModal({
    isOpen,
    onClose,
    onCreated,
    onUpdated,
    restaurantId,
    taskId,
    taskTitle,
    checklistId,
    checklistAssumptionId,
    taskExecutionId,
    existingIssue,
}: IssueReportModalProps) {
    const mode: Mode = existingIssue ? "edit" : "create";
    const [description, setDescription] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [existingPhotoPaths, setExistingPhotoPaths] = useState<string[]>([]);
    const [existingPhotoUrls, setExistingPhotoUrls] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const reportIssue = useReportIssue();
    const updateIssue = useUpdateIssue();

    // Prefill no modo edit
    useEffect(() => {
        if (!isOpen) return;
        if (existingIssue) {
            setDescription(existingIssue.description);
            setExistingPhotoPaths(existingIssue.photos ?? []);
        } else {
            setDescription("");
            setExistingPhotoPaths([]);
        }
        setFiles([]);
        setError(null);
    }, [isOpen, existingIssue]);

    // Resolve signed URLs das fotos existentes (modo edit)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (existingPhotoPaths.length === 0) { setExistingPhotoUrls({}); return; }
            const entries: Record<string, string> = {};
            for (const path of existingPhotoPaths) {
                const url = await getPhotoSignedUrl(path);
                if (url) entries[path] = url;
            }
            if (!cancelled) setExistingPhotoUrls(entries);
        })();
        return () => { cancelled = true; };
    }, [existingPhotoPaths]);

    if (!isOpen) return null;

    const handleRemoveExistingPhoto = (path: string) => {
        setExistingPhotoPaths(prev => prev.filter(p => p !== path));
    };

    const handleSubmit = async () => {
        const trimmed = description.trim();
        if (trimmed.length < 3) {
            setError("Descreva o problema (mínimo 3 caracteres).");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const newPhotoPaths: string[] = [];
            for (const f of files) {
                const path = await uploadEvidencePhoto(f, restaurantId, taskId);
                newPhotoPaths.push(path);
            }

            if (mode === "create") {
                await reportIssue.mutateAsync({
                    restaurant_id: restaurantId,
                    task_id: taskId,
                    checklist_id: checklistId,
                    checklist_assumption_id: checklistAssumptionId ?? null,
                    task_execution_id: taskExecutionId ?? null,
                    description: trimmed,
                    photos: newPhotoPaths,
                });
                onCreated?.();
            } else if (existingIssue) {
                const mergedPhotos = [...existingPhotoPaths, ...newPhotoPaths];
                await updateIssue.mutateAsync({
                    id: existingIssue.id,
                    restaurantId,
                    description: trimmed !== existingIssue.description ? trimmed : undefined,
                    photos: mergedPhotos,
                });
                onUpdated?.();
            }
            setDescription("");
            setFiles([]);
            onClose();
        } catch (e) {
            setError((e as Error).message || "Erro ao salvar ocorrência");
        } finally {
            setSubmitting(false);
        }
    };

    const title = mode === "edit" ? "Editar ocorrência" : "Registrar ocorrência";
    const submitLabel = submitting
        ? (mode === "edit" ? "Salvando..." : "Enviando...")
        : (mode === "edit" ? "Salvar alterações" : "Registrar");

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full sm:max-w-md bg-[#101d22] rounded-t-2xl sm:rounded-2xl border border-[#233f48] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-[#233f48] flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-white font-semibold">{title}</h2>
                        {taskTitle && <p className="text-xs text-[#92bbc9] mt-0.5 line-clamp-1">{taskTitle}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="text-[#92bbc9] hover:text-white text-2xl leading-none disabled:opacity-40"
                        aria-label="Fechar"
                    >×</button>
                </div>

                <div className="p-4 flex flex-col gap-4 overflow-y-auto">
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

                    {mode === "edit" && existingPhotoPaths.length > 0 && (
                        <div>
                            <label className="text-xs text-[#92bbc9] block mb-1.5">
                                Fotos atuais
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {existingPhotoPaths.map((path) => (
                                    <div key={path} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#233f48] bg-[#0c1518]">
                                        {existingPhotoUrls[path] ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={existingPhotoUrls[path]} alt="evidência" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5d7a83]">…</div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveExistingPhoto(path)}
                                            disabled={submitting}
                                            className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500/80 disabled:opacity-40"
                                            aria-label="Remover foto"
                                        >
                                            <span className="material-symbols-outlined text-[12px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs text-[#92bbc9] block mb-1.5">
                            {mode === "edit" ? "Adicionar fotos" : "Fotos"} (opcional)
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
                                {files.length} novo{files.length > 1 ? "s" : ""} arquivo{files.length > 1 ? "s" : ""} selecionado{files.length > 1 ? "s" : ""}
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-xs text-red-400">
                            {error}
                        </div>
                    )}

                    <p className="text-[11px] text-[#92bbc9]/70">
                        {mode === "edit"
                            ? "Você pode editar enquanto a ocorrência está aberta. Depois que o gestor começar a tratar, a edição é bloqueada."
                            : "A ocorrência será enviada para o gestor. A tarefa pode ser concluída normalmente."}
                    </p>
                </div>

                <div className="p-4 border-t border-[#233f48] flex gap-2 shrink-0">
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
                        {submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
