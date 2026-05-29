"use client";

import { useEffect, useMemo, useState } from "react";
import {
    useReceivingTemplate,
    useCreateReceivingTemplate,
    useUpdateReceivingTemplate,
} from "@/lib/hooks/use-receiving-templates";
import { useAllAreas } from "@/lib/hooks/use-areas";
import { RecurrencePicker } from "@/components/checklists/recurrence-picker-modal";
import type { ReceivingTemplate, ReceivingTemplateTask, RecurrenceConfig, RecurrenceV2 } from "@/lib/types";
import { SHIFT_OPTIONS, type ShiftValue } from "@/lib/utils/shift-labels";

interface TemplateFormModalProps {
    restaurantId: string;
    template: ReceivingTemplate | null;
    onClose: () => void;
}

type RecurrenceType = ReceivingTemplate["recurrence"];

/** Opções "diretas" do dropdown — custom abre modal dedicado. */
const RECURRENCE_OPTIONS: Array<{ value: RecurrenceType; label: string }> = [
    { value: "daily", label: "Diária" },
    { value: "weekdays", label: "Dias úteis (seg–sex)" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensal" },
    { value: "yearly", label: "Anual" },
    { value: "custom", label: "Personalizada…" },
];

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

/** Resumo curto para descrever recurrence_config v1/v2 ao usuário. */
function describeRecurrence(
    recurrence: RecurrenceType,
    config: RecurrenceConfig | RecurrenceV2 | null | undefined,
): string {
    if (recurrence !== "custom") {
        const opt = RECURRENCE_OPTIONS.find((o) => o.value === recurrence);
        return opt?.label ?? recurrence;
    }
    if (!config) return "Personalizada (configurar…)";
    // v2 rrule
    if (typeof config === "object" && "type" in config && config.type === "custom") {
        const v2 = config as RecurrenceV2;
        if ("rrule" in v2) {
            const r = (v2 as { rrule?: string }).rrule;
            if (typeof r === "string") {
                return `Personalizada (${r.replace(/^RRULE:/, "").slice(0, 50)}…)`;
            }
        }
    }
    // v1 legado
    const v1 = config as RecurrenceConfig;
    const days = Array.isArray(v1.days_of_week) ? v1.days_of_week : [];
    const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const daysStr = days.map((d) => dayLabels[d]).filter(Boolean).join(", ");
    return daysStr ? `Personalizada (${daysStr})` : "Personalizada";
}

export function TemplateFormModal({ restaurantId, template, onClose }: TemplateFormModalProps) {
    const isEditing = !!template;
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
    const [shift, setShift] = useState<ShiftValue>(
        (effectiveTemplate?.shift as ShiftValue) ?? "any",
    );
    const [recurrence, setRecurrence] = useState<RecurrenceType>(
        effectiveTemplate?.recurrence ?? "daily",
    );
    const [recurrenceConfig, setRecurrenceConfig] = useState<
        RecurrenceConfig | RecurrenceV2 | null
    >(effectiveTemplate?.recurrence_config ?? null);
    const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
    const [tasks, setTasks] = useState<TaskDraft[]>(() => templateToDraftTasks(effectiveTemplate));
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Quando o detalhe completo carregar, sincroniza tasks.
    useEffect(() => {
        if (fullTemplate && fullTemplate.tasks) {
            setTasks(templateToDraftTasks(fullTemplate));
            setRecurrenceConfig(fullTemplate.recurrence_config ?? null);
            setShift((fullTemplate.shift as ShiftValue) ?? "any");
        }
    }, [fullTemplate]);

    const sortedAreas = useMemo(
        () => areas.slice().sort((a, b) => a.name.localeCompare(b.name)),
        [areas],
    );

    const handleRecurrenceChange = (next: RecurrenceType) => {
        setRecurrence(next);
        if (next === "custom") {
            // Só abre o picker quando muda PARA custom; se já era custom mantém config.
            if (recurrence !== "custom") {
                setShowRecurrencePicker(true);
            }
        } else {
            // Limpa config para tipos simples (sem config necessária).
            setRecurrenceConfig(null);
        }
    };

    const handleRecurrenceConfirm = (config: RecurrenceV2) => {
        setRecurrenceConfig(config);
        setShowRecurrencePicker(false);
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
        if (recurrence === "custom" && !recurrenceConfig) {
            setErrorMsg("Configure os dias da recorrência personalizada.");
            return;
        }

        const shiftPayload = shift === "any" ? null : shift;

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
                    description: description?.trim() || null,
                    area_id: areaId,
                    shift: shiftPayload,
                    recurrence,
                    recurrence_config: recurrenceConfig,
                    tasks: tasksPayload,
                });
            } else {
                await createTemplate.mutateAsync({
                    restaurant_id: restaurantId,
                    name: cleanName,
                    description: description?.trim() || undefined,
                    area_id: areaId,
                    shift: shiftPayload,
                    recurrence,
                    recurrence_config: recurrenceConfig ?? undefined,
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
        <>
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
                onClick={onClose}
            >
                <div
                    className="bg-[#16262c] border border-[#233f48] rounded-t-2xl md:rounded-2xl w-full md:max-w-[920px] max-h-[95vh] md:max-h-[90vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#233f48] shrink-0">
                        <h3 className="text-white font-bold text-base">
                            {isEditing ? "Editar modelo de recebimento" : "Novo modelo de recebimento"}
                        </h3>
                        <button onClick={onClose} className="text-[#92bbc9] hover:text-white">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Conteúdo grid 2 colunas em md+; empilhado em sm */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x md:divide-[#233f48]">
                            {/* Coluna esquerda — Dados do modelo */}
                            <div className="px-6 py-5 space-y-5">
                                <div>
                                    <h4 className="text-xs font-bold text-[#13b6ec] uppercase tracking-wider mb-3">
                                        Dados do modelo
                                    </h4>
                                </div>

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
                                        placeholder="Instruções para o colaborador ao executar"
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
                                        Turno
                                    </label>
                                    <select
                                        value={shift}
                                        onChange={(e) => setShift(e.target.value as ShiftValue)}
                                        className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#13b6ec]"
                                    >
                                        {SHIFT_OPTIONS.map((s) => (
                                            <option key={s.value} value={s.value}>
                                                {s.label}
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
                                        onChange={(e) => handleRecurrenceChange(e.target.value as RecurrenceType)}
                                        className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#13b6ec]"
                                    >
                                        {RECURRENCE_OPTIONS.map((r) => (
                                            <option key={r.value} value={r.value}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </select>
                                    {recurrence === "custom" && (
                                        <button
                                            type="button"
                                            onClick={() => setShowRecurrencePicker(true)}
                                            className="mt-2 w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2 text-left text-xs text-[#92bbc9] hover:border-[#13b6ec] transition-colors flex items-center justify-between"
                                        >
                                            <span>{describeRecurrence(recurrence, recurrenceConfig)}</span>
                                            <span className="material-symbols-outlined text-[16px] text-[#13b6ec]">tune</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Coluna direita — Tarefas */}
                            <div className="px-6 py-5 space-y-3 bg-[#101d22]/30 md:bg-transparent">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-[#13b6ec] uppercase tracking-wider">
                                        Tarefas ({tasks.length})
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={addTask}
                                        className="text-[#13b6ec] text-xs font-bold flex items-center gap-1 hover:underline"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">add</span>
                                        Nova tarefa
                                    </button>
                                </div>
                                <ul className="flex flex-col gap-2">
                                    {tasks.map((t, idx) => (
                                        <li
                                            key={idx}
                                            className="bg-[#101d22] border border-[#233f48] rounded-lg p-3 flex flex-col gap-2"
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className="text-[#557682] text-xs font-bold pt-2.5 w-5 text-center tabular-nums">
                                                    {idx + 1}
                                                </span>
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
                                            <div className="flex flex-wrap gap-3 text-xs text-[#92bbc9] pl-7">
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
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-[#233f48] px-6 py-4 shrink-0">
                        {errorMsg && (
                            <div className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                                {errorMsg}
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-2">
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
            </div>

            {showRecurrencePicker && (
                <RecurrencePicker
                    initial={
                        recurrenceConfig && typeof recurrenceConfig === "object" && !("type" in recurrenceConfig)
                            ? (recurrenceConfig as RecurrenceConfig)
                            : undefined
                    }
                    onConfirm={handleRecurrenceConfirm}
                    onCancel={() => setShowRecurrencePicker(false)}
                />
            )}
        </>
    );
}
