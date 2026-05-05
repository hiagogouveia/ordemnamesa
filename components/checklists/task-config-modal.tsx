"use client";

import { useState } from "react";
import type { TaskType, TaskConfig } from "@/lib/types";
import { resolveTaskType } from "@/lib/utils/task-alert";

interface TaskConfigDraft {
    type?: TaskType | null;
    is_critical?: boolean;
    requires_photo?: boolean;
    requires_observation?: boolean;
    max_photos?: number | null;
    task_config?: TaskConfig | null;
}

interface TaskConfigModalProps {
    initial: TaskConfigDraft;
    onConfirm: (next: Required<Pick<TaskConfigDraft, 'type' | 'is_critical' | 'requires_photo' | 'requires_observation' | 'max_photos' | 'task_config'>>) => void;
    onCancel: () => void;
}

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
    { value: 'boolean', label: 'Concluir / Não Concluir (Padrão)' },
    { value: 'date', label: 'Selecionar Data / Validade' },
    { value: 'number', label: 'Digitar Valor (Ex: Temperaturas)' },
    { value: 'rating', label: 'Avaliação (5 Estrelas)' },
];

export function TaskConfigModal({ initial, onConfirm, onCancel }: TaskConfigModalProps) {
    const [type, setType] = useState<TaskType>(resolveTaskType(initial.type));
    const [isCritical, setIsCritical] = useState<boolean>(!!initial.is_critical);
    const [requiresPhoto, setRequiresPhoto] = useState<boolean>(!!initial.requires_photo);
    const [maxPhotos, setMaxPhotos] = useState<number | null>(initial.max_photos ?? null);
    const [requiresObservation, setRequiresObservation] = useState<boolean>(!!initial.requires_observation);
    const [minValue, setMinValue] = useState<string>(
        initial.task_config?.min_value !== undefined && initial.task_config?.min_value !== null
            ? String(initial.task_config.min_value)
            : ""
    );
    const [maxValue, setMaxValue] = useState<string>(
        initial.task_config?.max_value !== undefined && initial.task_config?.max_value !== null
            ? String(initial.task_config.max_value)
            : ""
    );

    const minNum = minValue.trim() === "" ? undefined : Number(minValue);
    const maxNum = maxValue.trim() === "" ? undefined : Number(maxValue);

    const numberRangeInvalid =
        type === 'number'
        && minNum !== undefined && maxNum !== undefined
        && Number.isFinite(minNum) && Number.isFinite(maxNum)
        && minNum > maxNum;

    const maxPhotosInvalid = requiresPhoto && maxPhotos !== null && maxPhotos < 1;

    const canConfirm = !numberRangeInvalid && !maxPhotosInvalid;

    const handleConfirm = () => {
        if (!canConfirm) return;
        let task_config: TaskConfig | null = null;
        if (type === 'number') {
            const cfg: TaskConfig = {};
            if (minNum !== undefined && Number.isFinite(minNum)) cfg.min_value = minNum;
            if (maxNum !== undefined && Number.isFinite(maxNum)) cfg.max_value = maxNum;
            task_config = Object.keys(cfg).length > 0 ? cfg : null;
        }
        onConfirm({
            type,
            is_critical: isCritical,
            requires_photo: requiresPhoto,
            requires_observation: requiresObservation,
            max_photos: requiresPhoto ? maxPhotos : null,
            task_config,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-[480px] flex flex-col shadow-2xl max-h-[90vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#233f48] shrink-0">
                    <h2 className="text-white font-bold text-base">Configurar Tarefa</h2>
                    <button
                        onClick={onCancel}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors"
                        aria-label="Fechar"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-5 overflow-y-auto">
                    {/* 1. Tipo de resposta */}
                    <div>
                        <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">
                            Tipo de resposta
                        </label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as TaskType)}
                            className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                        >
                            {TYPE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* 2. Configurações específicas do tipo */}
                    {type === 'number' && (
                        <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#13b6ec] text-[18px]">tune</span>
                                <p className="text-white text-sm font-bold">Parâmetros de alerta (opcional)</p>
                            </div>
                            <p className="text-[#92bbc9] text-xs">Se o valor sair deste intervalo, será gerado um alerta.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-[#92bbc9] uppercase tracking-wider mb-1">Valor Mínimo</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={minValue}
                                        onChange={(e) => setMinValue(e.target.value)}
                                        placeholder="Min"
                                        className="w-full bg-[#101d22] border border-[#325a67] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#13b6ec]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-[#92bbc9] uppercase tracking-wider mb-1">Valor Máximo</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={maxValue}
                                        onChange={(e) => setMaxValue(e.target.value)}
                                        placeholder="Max"
                                        className="w-full bg-[#101d22] border border-[#325a67] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#13b6ec]"
                                    />
                                </div>
                            </div>
                            {numberRangeInvalid && (
                                <p className="text-amber-400 text-xs">Valor mínimo deve ser menor ou igual ao máximo.</p>
                            )}
                        </div>
                    )}

                    {type === 'rating' && (
                        <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-4">
                            <p className="text-[#92bbc9] text-xs flex items-start gap-2">
                                <span className="material-symbols-outlined text-amber-400 text-[16px] mt-0.5">info</span>
                                Avaliações de 1 a 3 estrelas geram alerta automaticamente.
                            </p>
                        </div>
                    )}

                    {type === 'date' && (
                        <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-4">
                            <p className="text-[#92bbc9] text-xs flex items-start gap-2">
                                <span className="material-symbols-outlined text-amber-400 text-[16px] mt-0.5">info</span>
                                Será gerado um alerta de vencimento se a data for igual ou anterior a hoje.
                            </p>
                        </div>
                    )}

                    {/* 3. Configurações gerais */}
                    <div className="border-t border-[#233f48] pt-5 space-y-3">
                        <p className="text-[10px] font-bold text-[#92bbc9] uppercase tracking-wider">
                            Configurações gerais
                        </p>

                        <label className="flex items-center justify-between gap-3 cursor-pointer p-3 bg-[#16262c] border border-[#233f48] rounded-xl">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="material-symbols-outlined text-amber-400 text-[18px] shrink-0">priority_high</span>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-white text-sm font-bold truncate">Marcar como crítica</span>
                                    <span className="text-[#92bbc9] text-xs">Apenas sinalização visual</span>
                                </div>
                            </div>
                            <div className="shrink-0 min-w-[44px] flex justify-end">
                                <input
                                    type="checkbox"
                                    checked={isCritical}
                                    onChange={(e) => setIsCritical(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="relative w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                            </div>
                        </label>

                        <div className="flex flex-col gap-2 p-3 bg-[#16262c] border border-[#233f48] rounded-xl">
                            <label className="flex items-center justify-between gap-3 cursor-pointer">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[18px] shrink-0">photo_camera</span>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-white text-sm font-bold truncate">Exigir foto</span>
                                        <span className="text-[#92bbc9] text-xs">Mínimo obrigatório: 1 foto</span>
                                    </div>
                                </div>
                                <div className="shrink-0 min-w-[44px] flex justify-end">
                                    <input
                                        type="checkbox"
                                        checked={requiresPhoto}
                                        onChange={(e) => setRequiresPhoto(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="relative w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]" />
                                </div>
                            </label>

                            {requiresPhoto && (
                                <div className="pt-2 border-t border-[#233f48]">
                                    <label className="block text-[10px] font-bold text-[#92bbc9] uppercase tracking-wider mb-1">
                                        Máximo de fotos (opcional)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={maxPhotos ?? ""}
                                        onChange={(e) => {
                                            const v = e.target.value.trim();
                                            if (v === "") { setMaxPhotos(null); return; }
                                            const n = Number(v);
                                            setMaxPhotos(Number.isFinite(n) ? n : null);
                                        }}
                                        placeholder="Sem limite"
                                        className="w-full bg-[#101d22] border border-[#325a67] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#13b6ec]"
                                    />
                                    {maxPhotosInvalid && (
                                        <p className="text-amber-400 text-xs mt-1">Máximo de fotos deve ser pelo menos 1.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <label className="flex items-center justify-between gap-3 cursor-pointer p-3 bg-[#16262c] border border-[#233f48] rounded-xl">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="material-symbols-outlined text-[#13b6ec] text-[18px] shrink-0">edit_note</span>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-white text-sm font-bold truncate">Exigir observação</span>
                                    <span className="text-[#92bbc9] text-xs">Texto obrigatório na execução</span>
                                </div>
                            </div>
                            <div className="shrink-0 min-w-[44px] flex justify-end">
                                <input
                                    type="checkbox"
                                    checked={requiresObservation}
                                    onChange={(e) => setRequiresObservation(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="relative w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]" />
                            </div>
                        </label>
                    </div>
                </div>

                <div className="flex items-center gap-3 p-4 border-t border-[#233f48] shrink-0">
                    <div className="flex gap-3 ml-auto">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2.5 rounded-xl bg-[#233f48] text-white font-bold text-sm hover:bg-[#2c4e5a] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                            className="px-5 py-2.5 rounded-xl bg-[#13b6ec] text-[#0a1215] font-bold text-sm hover:bg-[#10a1d4] transition-colors shadow-[0_4px_14px_0_rgba(19,182,236,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
