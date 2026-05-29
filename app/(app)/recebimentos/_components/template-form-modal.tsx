"use client";

import { useEffect, useMemo, useState } from "react";
import {
    useReceivingTemplate,
    useCreateReceivingTemplate,
    useUpdateReceivingTemplate,
} from "@/lib/hooks/use-receiving-templates";
import { useAllAreas } from "@/lib/hooks/use-areas";
import type { ReceivingTemplate, ReceivingTemplateTask } from "@/lib/types";

interface TemplateFormModalProps {
    restaurantId: string;
    template: ReceivingTemplate | null;
    onClose: () => void;
}

type RecurrenceType = ReceivingTemplate["recurrence"];

const RECURRENCE_OPTIONS: Array<{ value: RecurrenceType; label: string }> = [
    { value: "daily", label: "Diária" },
    { value: "weekdays", label: "Dias úteis (seg–sex)" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensal" },
    { value: "custom", label: "Personalizada (dias específicos)" },
];

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type TaskDraft = {
    id?: string;
    title: string;
    requires_photo: boolean;
    is_critical: boolean;
    requires_observation: boolean;
};

function templateToDraftTasks(t: ReceivingTemplate | null): TaskDraft[] {
    if (!t?.tasks || t.tasks.length === 0) {
        return [{ title: "", requires_photo: false, is_critical: false, requires_observation: false }];
    }
    return t.tasks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((task) => ({
            id: task.id,
            title: task.title,
            requires_photo: task.requires_photo,
            is_critical: task.is_critical,
            requires_observation: task.requires_observation,
        }));
}

export function TemplateFormModal({ restaurantId, template, onClose }: TemplateFormModalProps) {
    const isEditing = !!template;
    // Fetch detalhe completo (com tasks) se for edição — listagem só traz metadado.
    const { data: fullTemplate } = useReceivingTemplate(
        restaurantId,
        isEditing ? template.id : undefined,
    );
    const effectiveTemplate = fullTemplate ?? template;

    const { data: areas = [] } = useAllAreas(restaurantId);
    const createTemplate = useCreateReceivingTemplate();
    const updateTemplate = useUpdateReceivingTemplate();

    const [name, setName] = useState(effectiveTemplate?.name ?? "");
    const [description, setDescription] = useState(effectiveTemplate?.description ?? "");
    const [areaId, setAreaId] = useState(effectiveTemplate?.area_id ?? "");
    const [recurrence, setRecurrence] = useState<RecurrenceType>(effectiveTemplate?.recurrence ?? "daily");
    const [customDays, setCustomDays] = useState<number[]>(() => {
        const cfg = effectiveTemplate?.recurrence_config as { days_of_week?: number[] } | null | undefined;
        return cfg?.days_of_week ?? [];
    });
    const [tasks, setTasks] = useState<TaskDraft[]>(() => templateToDraftTasks(effectiveTemplate));
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Quando o detalhe completo carregar, sincroniza tasks (lista veio sem tasks).
    useEffect(() => {
        if (fullTemplate && fullTemplate.tasks) {
            setTasks(templateToDraftTasks(fullTemplate));
            const cfg = fullTemplate.recurrence_config as { days_of_week?: number[] } | null | undefined;
            if (cfg?.days_of_week) setCustomDays(cfg.days_of_week);
        }
    }, [fullTemplate]);

    const sortedAreas = useMemo(
        () => areas.slice().sort((a, b) => a.name.localeCompare(b.name)),
        [areas],
    );

    const toggleCustomDay = (day: number) => {
        setCustomDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
        );
    };

    const updateTask = (index: number, patch: Partial<TaskDraft>) => {
        setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    };

    const addTask = () => {
        setTasks((prev) => [
            ...prev,
            { title: "", requires_photo: false, is_critical: false, requires_observation: false },
        ]);
    };

    const removeTask = (index: number) => {
        setTasks((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    };

    const handleSave = async () => {
        setErrorMsg(null);

        const cleanName = name.trim();
        if (!cleanName) {
            setErrorMsg("Informe um nome para o modelo.");
            return;
        }
        if (!areaId) {
            setErrorMsg("Selecione uma área.");
            return;
        }
        const cleanTasks = tasks
            .map((t) => ({ ...t, title: t.title.trim() }))
            .filter((t) => t.title.length > 0);
        if (cleanTasks.length === 0) {
            setErrorMsg("Adicione ao menos uma tarefa.");
            return;
        }
        if (recurrence === "custom" && customDays.length === 0) {
            setErrorMsg("Recorrência personalizada exige pelo menos um dia da semana.");
            return;
        }

        const recurrence_config =
            recurrence === "custom"
                ? {
                    frequency: "weekly" as const,
                    interval: 1,
                    days_of_week: customDays,
                    end_type: "never" as const,
                }
                : null;

        const tasksPayload: Array<Partial<ReceivingTemplateTask> & { title: string }> = cleanTasks.map(
            (t, idx) => ({
                title: t.title,
                order: idx,
                requires_photo: t.requires_photo,
                is_critical: t.is_critical,
                requires_observation: t.requires_observation,
            }),
        );

        try {
            if (isEditing && template) {
                await updateTemplate.mutateAsync({
                    id: template.id,
                    restaurant_id: restaurantId,
                    name: cleanName,
                    description: description.trim() || null,
                    area_id: areaId,
                    recurrence,
                    recurrence_config,
                    tasks: tasksPayload,
                });
            } else {
                await createTemplate.mutateAsync({
                    restaurant_id: restaurantId,
                    name: cleanName,
                    description: description.trim() || undefined,
                    area_id: areaId,
                    recurrence,
                    recurrence_config: recurrence_config ?? undefined,
                    tasks: tasksPayload,
                });
            }
            onClose();
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : "Erro ao salvar modelo.");
        }
    };

    const saving = createTemplate.isPending || updateTemplate.isPending;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-[#16262c] border border-[#233f48] rounded-2xl w-full max-w-[560px] max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#233f48]">
                    <h3 className="text-white font-bold text-base">
                        {isEditing ? "Editar modelo de recebimento" : "Novo modelo de recebimento"}
                    </h3>
                    <button onClick={onClose} className="text-[#92bbc9] hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                            Nome <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Recebimento de Hortifruti"
                            className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#557682] focus:outline-none focus:border-[#13b6ec]"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                            Descrição <span className="text-[#557682] normal-case font-normal">(opcional)</span>
                        </label>
                        <textarea
                            value={description ?? ""}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            placeholder="Instruções para o colaborador ao executar esse recebimento"
                            className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#557682] focus:outline-none focus:border-[#13b6ec] resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                            Área <span className="text-red-400">*</span>
                        </label>
                        <select
                            value={areaId}
                            onChange={(e) => setAreaId(e.target.value)}
                            className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#13b6ec]"
                        >
                            <option value="">— Selecione —</option>
                            {sortedAreas.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                            Recorrência
                        </label>
                        <select
                            value={recurrence}
                            onChange={(e) => setRecurrence(e.target.value as RecurrenceType)}
                            className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#13b6ec]"
                        >
                            {RECURRENCE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                        {recurrence === "custom" && (
                            <div className="mt-2 flex gap-1.5 flex-wrap">
                                {WEEKDAY_LABELS.map((label, idx) => {
                                    const isOn = customDays.includes(idx);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => toggleCustomDay(idx)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                                isOn
                                                    ? "bg-[#13b6ec] text-[#0a1215]"
                                                    : "bg-[#101d22] border border-[#233f48] text-[#92bbc9]"
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">
                                Tarefas ({tasks.length})
                            </label>
                            <button
                                type="button"
                                onClick={addTask}
                                className="text-[#13b6ec] text-xs font-bold flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[14px]">add</span>
                                Adicionar
                            </button>
                        </div>
                        <ul className="flex flex-col gap-2">
                            {tasks.map((t, idx) => (
                                <li
                                    key={idx}
                                    className="bg-[#101d22] border border-[#233f48] rounded-lg p-3 flex flex-col gap-2"
                                >
                                    <div className="flex items-start gap-2">
                                        <input
                                            type="text"
                                            value={t.title}
                                            onChange={(e) => updateTask(idx, { title: e.target.value })}
                                            placeholder={`Tarefa ${idx + 1}`}
                                            className="flex-1 bg-[#16262c] border border-[#233f48] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#557682] focus:outline-none focus:border-[#13b6ec]"
                                        />
                                        {tasks.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeTask(idx)}
                                                className="shrink-0 p-2 text-[#557682] hover:text-red-400 transition-colors"
                                                title="Remover tarefa"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-3 text-xs text-[#92bbc9]">
                                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={t.requires_photo}
                                                onChange={(e) => updateTask(idx, { requires_photo: e.target.checked })}
                                                className="accent-[#13b6ec]"
                                            />
                                            Foto obrigatória
                                        </label>
                                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={t.is_critical}
                                                onChange={(e) => updateTask(idx, { is_critical: e.target.checked })}
                                                className="accent-[#13b6ec]"
                                            />
                                            Crítica
                                        </label>
                                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={t.requires_observation}
                                                onChange={(e) => updateTask(idx, { requires_observation: e.target.checked })}
                                                className="accent-[#13b6ec]"
                                            />
                                            Requer observação
                                        </label>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {errorMsg && (
                        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                            {errorMsg}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#233f48]">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg bg-[#13b6ec] text-white text-sm font-semibold hover:bg-[#0fa3d4] transition-colors disabled:opacity-50"
                    >
                        {saving ? "Salvando…" : isEditing ? "Salvar alterações" : "Criar modelo"}
                    </button>
                </div>
            </div>
        </div>
    );
}
