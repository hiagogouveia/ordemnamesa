"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
    useReceivingTemplate,
    useCreateReceivingTemplate,
    useUpdateReceivingTemplate,
} from "@/lib/hooks/use-receiving-templates";
import { useAllAreas } from "@/lib/hooks/use-areas";
import { useShifts } from "@/lib/hooks/use-shifts";
import { useEquipe } from "@/lib/hooks/use-equipe";
import { RecurrencePicker } from "@/components/checklists/recurrence-picker-modal";
import { DailyConfig } from "@/components/checklists/recurrence/daily-config";
import { WeeklyConfig } from "@/components/checklists/recurrence/weekly-config";
import { MonthlyConfig } from "@/components/checklists/recurrence/monthly-config";
import { YearlyConfig } from "@/components/checklists/recurrence/yearly-config";
import { TaskItem } from "@/components/checklists/task-item";
import { describeRecurrence } from "@/lib/utils/recurrence/describe";
import { SHIFT_OPTIONS, type ShiftValue } from "@/lib/utils/shift-labels";
import type {
    ChecklistTask,
    ReceivingTemplate,
    ReceivingTemplateTask,
    RecurrenceConfig,
    RecurrenceV2,
} from "@/lib/types";

interface TemplateFormModalProps {
    restaurantId: string;
    template: ReceivingTemplate | null;
    onClose: () => void;
}

/** Opções de dropdown — mesmo conjunto e ordem usados em Rotinas (checklist-form). */
type RecurrenceDropdownOption =
    | "shift_days"
    | "todos_os_dias"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "custom";

const RECURRENCE_DROPDOWN_OPTIONS: { value: RecurrenceDropdownOption; label: string }[] = [
    { value: "shift_days", label: "Dias do turno" },
    { value: "todos_os_dias", label: "Todos os dias" },
    { value: "daily", label: "Diário (exceto)" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensal" },
    { value: "yearly", label: "Anual" },
    { value: "custom", label: "Personalizar" },
];

/** Mesma lógica de mapeamento usada em checklist-form. */
function recurrenceToDropdownValue(
    recurrence: string | null | undefined,
    config: RecurrenceConfig | RecurrenceV2 | null | undefined,
): RecurrenceDropdownOption {
    const isV2 =
        typeof config === "object" &&
        config !== null &&
        (config as { version?: unknown }).version === 2;

    if (isV2) {
        const v2 = config as RecurrenceV2;
        if (v2.type === "shift_days") return "shift_days";
        if (v2.type === "daily") return "todos_os_dias";
        if (v2.type === "weekly") {
            const weekly = v2 as RecurrenceV2 & { type: "weekly"; weekdays?: number[] };
            if (Array.isArray(weekly.weekdays) && weekly.weekdays.length > 0) {
                return weekly.weekdays.length < 7 ? "daily" : "weekly";
            }
            return "weekly";
        }
        if (v2.type === "monthly") return "monthly";
        if (v2.type === "yearly") return "yearly";
        if (v2.type === "custom") return "custom";
    }
    if (recurrence === "daily") return "todos_os_dias";
    if (recurrence === "weekdays") return "weekly"; // legado
    if (recurrence === "shift_days") return "shift_days";
    if (recurrence === "weekly") return "weekly";
    if (recurrence === "monthly") return "monthly";
    if (recurrence === "yearly") return "yearly";
    if (recurrence === "custom") return "custom";
    return "todos_os_dias";
}

type TaskDraft = Partial<ChecklistTask> & { tempId: string };

function templateTaskToDraft(t: ReceivingTemplateTask): TaskDraft {
    return {
        tempId: t.id,
        title: t.title,
        description: t.description ?? undefined,
        requires_photo: t.requires_photo,
        is_critical: t.is_critical,
        requires_observation: t.requires_observation,
        order: t.order,
        type: t.type ?? null,
        max_photos: t.max_photos ?? null,
        task_config: t.task_config ?? null,
    };
}

function newEmptyTask(order: number): TaskDraft {
    return {
        tempId: `new-${order}-${Math.random().toString(36).slice(2)}`,
        title: "",
        requires_photo: false,
        is_critical: false,
        requires_observation: false,
        order,
    };
}

export function TemplateFormModal({ restaurantId, template, onClose }: TemplateFormModalProps) {
    const isEditing = !!template;
    const { data: fullTemplate } = useReceivingTemplate(
        restaurantId,
        isEditing ? template.id : undefined,
    );
    const effectiveTemplate = fullTemplate ?? template;

    const { data: areas = [] } = useAllAreas(restaurantId);
    const { data: shiftsData = [] } = useShifts(restaurantId);
    const { data: equipeData } = useEquipe(restaurantId);
    const equipe = equipeData?.equipe ?? [];
    const createTemplate = useCreateReceivingTemplate();
    const updateTemplate = useUpdateReceivingTemplate();

    // --- Form state ---
    const [name, setName] = useState(effectiveTemplate?.name ?? "");
    const [description, setDescription] = useState(effectiveTemplate?.description ?? "");
    const [areaId, setAreaId] = useState(effectiveTemplate?.area_id ?? "");
    const [shift, setShift] = useState<ShiftValue>(
        (effectiveTemplate?.shift as ShiftValue) ?? "any",
    );
    const [isIndividualMode, setIsIndividualMode] = useState(
        !!effectiveTemplate?.assigned_to_user_id,
    );
    const [assignedToUserId, setAssignedToUserId] = useState(
        effectiveTemplate?.assigned_to_user_id ?? "",
    );

    // Recurrence — mesmo padrão de checklist-form
    const [recurrence, setRecurrence] = useState<string>(effectiveTemplate?.recurrence ?? "daily");
    const [recurrenceConfig, setRecurrenceConfig] = useState<
        RecurrenceConfig | RecurrenceV2 | null
    >(effectiveTemplate?.recurrence_config ?? null);
    const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
    const [activeRecurrenceModal, setActiveRecurrenceModal] = useState<
        "daily" | "weekly" | "monthly" | "yearly" | null
    >(null);

    // Tasks (DnD)
    const [tasks, setTasks] = useState<TaskDraft[]>(() => {
        const src = effectiveTemplate?.tasks;
        if (!src || src.length === 0) return [newEmptyTask(0)];
        return src.slice().sort((a, b) => a.order - b.order).map(templateTaskToDraft);
    });

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Quando detalhe completo chega, sincroniza estado.
    useEffect(() => {
        if (!fullTemplate) return;
        setShift((fullTemplate.shift as ShiftValue) ?? "any");
        setRecurrence(fullTemplate.recurrence ?? "daily");
        setRecurrenceConfig(fullTemplate.recurrence_config ?? null);
        setAssignedToUserId(fullTemplate.assigned_to_user_id ?? "");
        setIsIndividualMode(!!fullTemplate.assigned_to_user_id);
        if (fullTemplate.tasks && fullTemplate.tasks.length > 0) {
            setTasks(
                fullTemplate.tasks
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map(templateTaskToDraft),
            );
        }
    }, [fullTemplate]);

    const sortedAreas = useMemo(
        () => areas.slice().sort((a, b) => a.name.localeCompare(b.name)),
        [areas],
    );

    // Membros da área selecionada (mesma regra do checklist-form: filtra equipe por área).
    const areaMembers = useMemo(() => {
        if (!areaId) return [];
        return equipe.filter((m) => m.areas?.some((a) => a.id === areaId));
    }, [equipe, areaId]);

    // Recurrence handlers — mesmo padrão de checklist-form
    const dropdownValue = recurrenceToDropdownValue(recurrence, recurrenceConfig);
    const handleRecurrenceChange = useCallback(
        (value: RecurrenceDropdownOption) => {
            if (value === "shift_days") {
                setRecurrence("shift_days");
                setRecurrenceConfig({ version: 2, type: "shift_days" });
                return;
            }
            if (value === "todos_os_dias") {
                setRecurrence("daily");
                setRecurrenceConfig({ version: 2, type: "daily" });
                return;
            }
            if (value === "custom") {
                setShowRecurrencePicker(true);
                return;
            }
            setActiveRecurrenceModal(value);
        },
        [],
    );

    const handleModalConfirm = useCallback((config: RecurrenceV2) => {
        setRecurrenceConfig(config);
        setRecurrence(config.type);
        setActiveRecurrenceModal(null);
    }, []);

    const recurrenceLabel = useMemo(() => {
        return describeRecurrence({
            recurrence,
            recurrence_config: recurrenceConfig,
        });
    }, [recurrence, recurrenceConfig]);

    // Tasks helpers
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const updateTask = useCallback(
        (id: string, updates: Partial<ChecklistTask>) => {
            setTasks((prev) =>
                prev.map((t) => (t.tempId === id ? { ...t, ...updates } : t)),
            );
        },
        [],
    );

    const removeTask = useCallback((id: string) => {
        setTasks((prev) => prev.filter((t) => t.tempId !== id));
    }, []);

    const addTask = useCallback(() => {
        setTasks((prev) => [...prev, newEmptyTask(prev.length)]);
    }, []);

    const handleDragEnd = useCallback(
        (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setTasks((prev) => {
                const oldIndex = prev.findIndex((t) => t.tempId === active.id);
                const newIndex = prev.findIndex((t) => t.tempId === over.id);
                if (oldIndex < 0 || newIndex < 0) return prev;
                return arrayMove(prev, oldIndex, newIndex).map((t, i) => ({
                    ...t,
                    order: i,
                }));
            });
        },
        [],
    );

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
            .map((t) => ({ ...t, title: (t.title ?? "").trim() }))
            .filter((t) => t.title.length > 0);
        if (cleanTasks.length === 0) {
            setErrorMsg("Adicione ao menos uma tarefa.");
            return;
        }

        const shiftPayload = shift === "any" ? null : shift;
        const assignedPayload =
            isIndividualMode && assignedToUserId ? assignedToUserId : null;

        const tasksPayload: Array<Partial<ReceivingTemplateTask> & { title: string }> =
            cleanTasks.map((t, idx) => ({
                title: t.title!,
                description: t.description ?? null,
                order: idx,
                requires_photo: !!t.requires_photo,
                is_critical: !!t.is_critical,
                requires_observation: !!t.requires_observation,
                type: t.type ?? null,
                max_photos: t.max_photos ?? null,
                task_config: t.task_config ?? null,
            }));

        try {
            if (isEditing && template) {
                await updateTemplate.mutateAsync({
                    id: template.id,
                    restaurant_id: restaurantId,
                    name: cleanName,
                    description: description?.trim() || null,
                    area_id: areaId,
                    assigned_to_user_id: assignedPayload,
                    shift: shiftPayload,
                    recurrence: recurrence as ReceivingTemplate["recurrence"],
                    recurrence_config: recurrenceConfig,
                    tasks: tasksPayload,
                });
            } else {
                await createTemplate.mutateAsync({
                    restaurant_id: restaurantId,
                    name: cleanName,
                    description: description?.trim() || undefined,
                    area_id: areaId,
                    assigned_to_user_id: assignedPayload ?? undefined,
                    shift: shiftPayload,
                    recurrence: recurrence as ReceivingTemplate["recurrence"],
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
                    className="bg-[#16262c] border border-[#233f48] rounded-t-2xl md:rounded-2xl w-full md:max-w-[1080px] max-h-[95vh] md:max-h-[90vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#233f48] shrink-0">
                        <h3 className="text-white font-bold text-base">
                            {isEditing ? "Editar modelo de recebimento" : "Novo modelo de recebimento"}
                        </h3>
                        <button onClick={onClose} className="text-[#92bbc9] hover:text-white">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x md:divide-[#233f48]">
                            {/* Coluna esquerda — Dados */}
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
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            setAreaId(next);
                                            // Se o user atribuído não pertence à nova área, limpa.
                                            if (assignedToUserId && next) {
                                                const stillBelongs = equipe.some(
                                                    (m) =>
                                                        m.user_id === assignedToUserId &&
                                                        m.areas?.some((a) => a.id === next),
                                                );
                                                if (!stillBelongs) setAssignedToUserId("");
                                            }
                                        }}
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

                                {/* Responsável — mesmo padrão das rotinas */}
                                <div>
                                    <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                                        Responsável
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsIndividualMode(false);
                                                setAssignedToUserId("");
                                            }}
                                            className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                                                !isIndividualMode
                                                    ? "bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]"
                                                    : "bg-[#101d22] border-[#233f48] text-[#92bbc9] hover:border-[#325a67]"
                                            }`}
                                        >
                                            Toda a equipe da área
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsIndividualMode(true)}
                                            className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                                                isIndividualMode
                                                    ? "bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]"
                                                    : "bg-[#101d22] border-[#233f48] text-[#92bbc9] hover:border-[#325a67]"
                                            }`}
                                        >
                                            Usuário específico
                                        </button>
                                    </div>
                                    {isIndividualMode && (
                                        <select
                                            value={assignedToUserId}
                                            onChange={(e) => setAssignedToUserId(e.target.value)}
                                            disabled={!areaId}
                                            className="mt-2 w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#13b6ec] disabled:opacity-50"
                                        >
                                            <option value="">— Selecione o colaborador —</option>
                                            {areaMembers.map((m) => (
                                                <option key={m.user_id} value={m.user_id}>
                                                    {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
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

                                {/* Recorrência — exatamente o mesmo conjunto/handler das rotinas */}
                                <div>
                                    <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                                        Recorrência
                                    </label>
                                    <select
                                        value={dropdownValue}
                                        onChange={(e) =>
                                            handleRecurrenceChange(e.target.value as RecurrenceDropdownOption)
                                        }
                                        className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#13b6ec]"
                                    >
                                        {RECURRENCE_DROPDOWN_OPTIONS.map((r) => (
                                            <option key={r.value} value={r.value}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="mt-2 flex items-center justify-between text-xs">
                                        <span className="text-[#92bbc9]">{recurrenceLabel}</span>
                                        {(dropdownValue === "daily" ||
                                            dropdownValue === "weekly" ||
                                            dropdownValue === "monthly" ||
                                            dropdownValue === "yearly" ||
                                            dropdownValue === "custom") && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (dropdownValue === "custom") {
                                                        setShowRecurrencePicker(true);
                                                    } else {
                                                        setActiveRecurrenceModal(dropdownValue);
                                                    }
                                                }}
                                                className="text-[#13b6ec] font-semibold hover:underline inline-flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">tune</span>
                                                Configurar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Coluna direita — Tarefas (DnD + TaskItem) */}
                            <div className="px-6 pb-5 space-y-3 bg-[#101d22]/30 md:bg-transparent">
                                <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-[#16262c] border-b border-[#233f48] flex items-center justify-between">
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

                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                    onDragCancel={() => {}}
                                >
                                    <SortableContext
                                        items={tasks.map((t) => t.tempId)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-2">
                                            {tasks.map((task) => (
                                                <TaskItem
                                                    key={task.tempId}
                                                    task={task}
                                                    equipe={[]}
                                                    onUpdate={updateTask}
                                                    onRemove={removeTask}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>

                                {tasks.length === 0 && (
                                    <div className="text-center p-6 border border-dashed border-[#325a67] rounded-xl text-[#92bbc9] text-xs">
                                        Nenhuma tarefa. Clique em &ldquo;Nova tarefa&rdquo; para começar.
                                    </div>
                                )}
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

            {/* Modais reutilizados de Rotinas */}
            {activeRecurrenceModal === "daily" && (
                <DailyConfig
                    initialExcluded={
                        recurrenceConfig &&
                        typeof recurrenceConfig === "object" &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === "weekly"
                            ? // Para daily-config, "initialExcluded" é a inversa dos dias permitidos
                              [0, 1, 2, 3, 4, 5, 6].filter(
                                  (d) =>
                                      !(
                                          (recurrenceConfig as RecurrenceV2 & {
                                              type: "weekly";
                                              weekdays?: number[];
                                          }).weekdays ?? []
                                      ).includes(d),
                              )
                            : undefined
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift === "any" ? null : shift}
                />
            )}
            {activeRecurrenceModal === "weekly" && (
                <WeeklyConfig
                    initialWeekdays={
                        recurrenceConfig &&
                        typeof recurrenceConfig === "object" &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === "weekly"
                            ? ((recurrenceConfig as RecurrenceV2 & {
                                  type: "weekly";
                                  weekdays?: number[];
                              }).weekdays ?? undefined)
                            : undefined
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift === "any" ? null : shift}
                />
            )}
            {activeRecurrenceModal === "monthly" && (
                <MonthlyConfig
                    initial={
                        recurrenceConfig &&
                        typeof recurrenceConfig === "object" &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === "monthly"
                            ? (recurrenceConfig as RecurrenceV2 & { type: "monthly" })
                            : undefined
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift === "any" ? null : shift}
                />
            )}
            {activeRecurrenceModal === "yearly" && (
                <YearlyConfig
                    initial={
                        recurrenceConfig &&
                        typeof recurrenceConfig === "object" &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === "yearly"
                            ? (recurrenceConfig as RecurrenceV2 & { type: "yearly" })
                            : undefined
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift === "any" ? null : shift}
                />
            )}
            {showRecurrencePicker && (
                <RecurrencePicker
                    initial={
                        recurrenceConfig &&
                        typeof recurrenceConfig === "object" &&
                        !("version" in (recurrenceConfig as object))
                            ? (recurrenceConfig as RecurrenceConfig)
                            : undefined
                    }
                    onConfirm={(config) => {
                        handleModalConfirm(config);
                        setShowRecurrencePicker(false);
                    }}
                    onCancel={() => setShowRecurrencePicker(false)}
                />
            )}

        </>
    );
}
