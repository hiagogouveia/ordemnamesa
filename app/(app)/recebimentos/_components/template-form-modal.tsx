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
import { useUserShifts } from "@/lib/hooks/use-user-roles-shifts";
import { RecurrencePicker } from "@/components/checklists/recurrence-picker-modal";
import { DailyConfig } from "@/components/checklists/recurrence/daily-config";
import { WeeklyConfig } from "@/components/checklists/recurrence/weekly-config";
import { MonthlyConfig } from "@/components/checklists/recurrence/monthly-config";
import { YearlyConfig } from "@/components/checklists/recurrence/yearly-config";
import { TaskItem } from "@/components/checklists/task-item";
import { describeRecurrence } from "@/lib/utils/recurrence/describe";
import { type ShiftValue } from "@/lib/utils/shift-labels";

const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
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
    // Sprint 92 — áreas do modelo (N:N). Todas com o mesmo peso.
    const [areaIds, setAreaIds] = useState<string[]>(
        effectiveTemplate?.area_ids ?? (effectiveTemplate?.area_id ? [effectiveTemplate.area_id] : []),
    );
    // Confirmação antes de remover área com responsáveis específicos dela.
    const [pendingAreaRemoval, setPendingAreaRemoval] = useState<{ areaId: string; areaName: string; affected: { user_id: string; name: string }[] } | null>(null);
    // Sprint 67: shiftIds (N:N) é a fonte da verdade. Vazio = "Todos os turnos".
    const [shiftIds, setShiftIds] = useState<string[]>(
        effectiveTemplate?.shift_ids ?? (effectiveTemplate?.shift_id ? [effectiveTemplate.shift_id] : []),
    );
    const [isIndividualMode, setIsIndividualMode] = useState(
        effectiveTemplate?.assignment_type === "user"
        || (effectiveTemplate?.responsible_user_ids?.length ?? 0) > 0
        || !!effectiveTemplate?.assigned_to_user_id,
    );
    // Sprint 92 — responsáveis específicos (N:N).
    const [responsibleIds, setResponsibleIds] = useState<string[]>(
        effectiveTemplate?.responsible_user_ids
        ?? (effectiveTemplate?.assigned_to_user_id ? [effectiveTemplate.assigned_to_user_id] : []),
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
        setShiftIds(fullTemplate.shift_ids ?? (fullTemplate.shift_id ? [fullTemplate.shift_id] : []));
        setRecurrence(fullTemplate.recurrence ?? "daily");
        setRecurrenceConfig(fullTemplate.recurrence_config ?? null);
        const loadedResponsibles = fullTemplate.responsible_user_ids
            ?? (fullTemplate.assigned_to_user_id ? [fullTemplate.assigned_to_user_id] : []);
        setResponsibleIds(loadedResponsibles);
        setAreaIds(fullTemplate.area_ids ?? (fullTemplate.area_id ? [fullTemplate.area_id] : []));
        setIsIndividualMode(fullTemplate.assignment_type === "user" || loadedResponsibles.length > 0);
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

    // Sprint 92 — membros elegíveis = UNIÃO dos membros de todas as áreas marcadas
    // (mesma regra do checklist-form).
    const areaMembers = useMemo(() => {
        if (areaIds.length === 0) return [];
        return equipe.filter((m) => m.areas?.some((a) => areaIds.includes(a.id)));
    }, [equipe, areaIds]);

    /** Nome das áreas do colaborador que estão selecionadas — rótulo "Maria · Estoque". */
    const memberAreaLabel = (userId: string): string => {
        const m = equipe.find((x) => x.user_id === userId);
        return (m?.areas ?? [])
            .filter((a) => areaIds.includes(a.id))
            .map((a) => a.name)
            .join(", ");
    };

    /**
     * Marca/desmarca uma área. Ao remover uma área que tem responsáveis dela e de
     * mais nenhuma outra selecionada, pede confirmação antes (decisão de UX s92).
     */
    const toggleArea = (id: string, areaName: string) => {
        if (!areaIds.includes(id)) {
            setAreaIds([...areaIds, id]);
            return;
        }
        const remaining = areaIds.filter((x) => x !== id);
        const affected = responsibleIds
            .map((uid) => equipe.find((m) => m.user_id === uid))
            .filter((m): m is NonNullable<typeof m> => Boolean(m))
            .filter((m) => !m.areas?.some((a) => remaining.includes(a.id)))
            .map((m) => ({ user_id: m.user_id, name: m.name }));

        if (affected.length > 0) {
            setPendingAreaRemoval({ areaId: id, areaName, affected });
            return;
        }
        setAreaIds(remaining);
    };

    const confirmAreaRemoval = () => {
        if (!pendingAreaRemoval) return;
        const removed = new Set(pendingAreaRemoval.affected.map((a) => a.user_id));
        setAreaIds(areaIds.filter((x) => x !== pendingAreaRemoval.areaId));
        setResponsibleIds(responsibleIds.filter((uid) => !removed.has(uid)));
        setPendingAreaRemoval(null);
    };

    // Sprint 66 — turnos de cada colaborador, para segmentar a seleção de responsável.
    const { data: allUserShifts = [] } = useUserShifts(restaurantId);
    const shiftNameById = useMemo(() => {
        const m = new Map<string, string>();
        shiftsData.forEach((s) => m.set(s.id, s.name));
        return m;
    }, [shiftsData]);
    const userShiftIdsByUser = useMemo(() => {
        const m = new Map<string, string[]>();
        allUserShifts.forEach((us) => {
            if (!m.has(us.user_id)) m.set(us.user_id, []);
            m.get(us.user_id)!.push(us.shift_id);
        });
        return m;
    }, [allUserShifts]);
    const memberShiftNames = useCallback(
        (userId: string): string[] => (userShiftIdsByUser.get(userId) ?? []).map((id) => shiftNameById.get(id) ?? "—"),
        [userShiftIdsByUser, shiftNameById],
    );
    // Sprint 67: compatibilidade por INTERSEÇÃO; vazio = "Todos os turnos".
    const isMemberShiftCompatible = useCallback(
        (userId: string): boolean => {
            if (shiftIds.length === 0) return true;
            const us = userShiftIdsByUser.get(userId) ?? [];
            return shiftIds.some((id) => us.includes(id));
        },
        [shiftIds, userShiftIdsByUser],
    );
    const compatibleMembers = useMemo(() => areaMembers.filter((m) => isMemberShiftCompatible(m.user_id)), [areaMembers, isMemberShiftCompatible]);
    const incompatibleMembers = useMemo(() => areaMembers.filter((m) => !isMemberShiftCompatible(m.user_id)), [areaMembers, isMemberShiftCompatible]);

    // Turnos selecionados (N:N): dias (união) e enum sombra derivado.
    const selectedShifts = useMemo(() => shiftsData.filter((s) => shiftIds.includes(s.id)), [shiftsData, shiftIds]);
    const resolvedShiftDays = selectedShifts.length > 0
        ? [...new Set(selectedShifts.flatMap((s) => s.days_of_week))].sort((a, b) => a - b)
        : null;
    const selectedShiftLabel = shiftIds.length > 0 ? selectedShifts.map((s) => s.name).join(", ") : null;
    const shiftEnum: ShiftValue = useMemo(() => {
        if (shiftIds.length !== 1) return "any";
        const st = shiftsData.find((s) => s.id === shiftIds[0])?.shift_type;
        return (st === "morning" || st === "afternoon" || st === "evening" ? st : "any") as ShiftValue;
    }, [shiftIds, shiftsData]);

    // Toggle de turno (checkbox). Ao mudar, sugere recorrência e reseta o
    // responsável se a interseção ficar vazia.
    const toggleShift = useCallback(
        (id: string) => {
            setShiftIds((prev) => {
                const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
                setRecurrence((prevRec) => {
                    if (prevRec !== "daily" && prevRec !== "shift_days") return prevRec;
                    setRecurrenceConfig({ version: 2, type: next.length > 0 ? "shift_days" : "daily" });
                    return next.length > 0 ? "shift_days" : "daily";
                });
                // s92: remove os responsáveis cuja interseção com os turnos ficou vazia.
                setResponsibleIds((prev) => (next.length === 0 ? prev : prev.filter((uid) => {
                    const us = userShiftIdsByUser.get(uid) ?? [];
                    return next.some((sid) => us.includes(sid));
                })));
                return next;
            });
        },
        [userShiftIdsByUser],
    );
    const selectAllTurnos = useCallback(() => {
        setShiftIds([]);
        setRecurrence((prevRec) => {
            if (prevRec !== "daily" && prevRec !== "shift_days") return prevRec;
            setRecurrenceConfig({ version: 2, type: "daily" });
            return "daily";
        });
    }, []);

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
        if (areaIds.length === 0) {
            setErrorMsg("Selecione ao menos uma área.");
            return;
        }
        if (isIndividualMode && responsibleIds.length === 0) {
            setErrorMsg("Selecione ao menos um responsável ou mude a atribuição para toda a equipe.");
            return;
        }
        const cleanTasks = tasks
            .map((t) => ({ ...t, title: (t.title ?? "").trim() }))
            .filter((t) => t.title.length > 0);
        if (cleanTasks.length === 0) {
            setErrorMsg("Adicione ao menos uma tarefa.");
            return;
        }

        const shiftPayload = shiftEnum === "any" ? null : shiftEnum;
        const responsiblesPayload = isIndividualMode ? responsibleIds : [];

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
                    area_ids: areaIds,
                    responsible_user_ids: responsiblesPayload,
                    assignment_type: isIndividualMode ? "user" : "area",
                    shift: shiftPayload,
                    shift_ids: shiftIds,
                    recurrence: recurrence as ReceivingTemplate["recurrence"],
                    recurrence_config: recurrenceConfig,
                    tasks: tasksPayload,
                });
            } else {
                await createTemplate.mutateAsync({
                    restaurant_id: restaurantId,
                    name: cleanName,
                    description: description?.trim() || undefined,
                    area_ids: areaIds,
                    responsible_user_ids: responsiblesPayload,
                    assignment_type: isIndividualMode ? "user" : "area",
                    shift: shiftPayload,
                    shift_ids: shiftIds,
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
                                        Áreas <span className="text-red-400">*</span>
                                    </label>
                                    {sortedAreas.length === 0 ? (
                                        <p className="text-amber-400 text-xs">
                                            Nenhuma área cadastrada. Cadastre em Configurações &gt; Áreas.
                                        </p>
                                    ) : (
                                        <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-2.5 space-y-1 max-h-44 overflow-y-auto">
                                            {sortedAreas.map((a) => {
                                                const checked = areaIds.includes(a.id);
                                                return (
                                                    <label key={a.id} className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleArea(a.id, a.name)}
                                                            className="w-4 h-4 accent-[#13b6ec]"
                                                        />
                                                        <span>{a.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {areaIds.length === 0 && sortedAreas.length > 0 && (
                                        <p className="mt-1.5 text-xs text-amber-400">Selecione ao menos uma área.</p>
                                    )}
                                    {areaIds.length > 1 && (
                                        <p className="mt-1.5 text-[11px] text-[#92bbc9]">
                                            Qualquer colaborador dessas {areaIds.length} áreas poderá executar este recebimento.
                                        </p>
                                    )}
                                </div>

                                {/* Responsável — mesmo padrão das rotinas */}
                                <div>
                                    <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                                        Responsáveis
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsIndividualMode(false);
                                                setResponsibleIds([]);
                                            }}
                                            className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                                                !isIndividualMode
                                                    ? "bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]"
                                                    : "bg-[#101d22] border-[#233f48] text-[#92bbc9] hover:border-[#325a67]"
                                            }`}
                                        >
                                            Toda a equipe das áreas
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
                                            Usuários específicos
                                        </button>
                                    </div>
                                    {isIndividualMode && (
                                        <>
                                            {/* s92 — seleção múltipla sobre a união dos membros das
                                                áreas marcadas, cada um rotulado com sua(s) área(s). */}
                                            {areaMembers.length > 0 && (
                                                <div className="mt-2 bg-[#101d22] border border-[#233f48] rounded-lg p-2.5 space-y-1 max-h-52 overflow-y-auto">
                                                    {compatibleMembers.map((m) => {
                                                        const checked = responsibleIds.includes(m.user_id);
                                                        const tn = memberShiftNames(m.user_id);
                                                        return (
                                                            <label key={m.user_id} className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => setResponsibleIds(checked
                                                                        ? responsibleIds.filter((id) => id !== m.user_id)
                                                                        : [...responsibleIds, m.user_id])}
                                                                    className="w-4 h-4 accent-[#13b6ec] shrink-0"
                                                                />
                                                                <span className="truncate">
                                                                    {m.name}
                                                                    <span className="text-[#92bbc9]"> · {memberAreaLabel(m.user_id) || "Sem área"}</span>
                                                                    {tn.length > 0 && <span className="text-[#557682] text-xs"> — {tn.join(", ")}</span>}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                    {incompatibleMembers.map((m) => {
                                                        const tn = memberShiftNames(m.user_id);
                                                        return (
                                                            <label key={m.user_id} className="flex items-center gap-2.5 text-sm text-[#557682] py-1 cursor-not-allowed">
                                                                <input type="checkbox" checked={false} disabled className="w-4 h-4 shrink-0" />
                                                                <span className="truncate">
                                                                    🔒 {m.name} — {tn.length > 0 ? `Turnos: ${tn.join(", ")}` : "Sem turno vinculado"}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {responsibleIds.length === 0 && (
                                                <p className="text-xs text-amber-400 mt-1.5">Selecione ao menos um colaborador.</p>
                                            )}
                                            {shiftIds.length > 0 && incompatibleMembers.length > 0 && (
                                                <p className="text-xs text-amber-400 mt-1.5">
                                                    {incompatibleMembers.length} colaborador{incompatibleMembers.length > 1 ? "es" : ""} não pertence{incompatibleMembers.length > 1 ? "m" : ""} aos turnos selecionados ({selectedShiftLabel}) e não pode{incompatibleMembers.length > 1 ? "m" : ""} ser atribuído{incompatibleMembers.length > 1 ? "s" : ""}.
                                                </p>
                                            )}
                                            {areaIds.length > 0 && areaMembers.length === 0 && (
                                                <p className="text-xs text-amber-400 mt-1.5">
                                                    Nenhum colaborador vinculado {areaIds.length > 1 ? "às áreas selecionadas" : "a esta área"}.
                                                </p>
                                            )}
                                            {areaIds.length > 0 && shiftIds.length > 0 && areaMembers.length > 0 && compatibleMembers.length === 0 && (
                                                <p className="text-xs text-amber-400 mt-1.5">
                                                    Nenhum colaborador {areaIds.length > 1 ? "das áreas selecionadas" : "da área"} pertence aos turnos selecionados ({selectedShiftLabel}).
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">
                                        Turnos
                                    </label>
                                    <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-2.5 space-y-1">
                                        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                            <input
                                                type="checkbox"
                                                checked={shiftIds.length === 0}
                                                onChange={selectAllTurnos}
                                                className="w-4 h-4 accent-[#13b6ec]"
                                            />
                                            <span className="font-medium">Todos os turnos</span>
                                        </label>
                                        {shiftsData.filter((s) => s.active).map((s) => (
                                            <label key={s.id} className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                                <input
                                                    type="checkbox"
                                                    checked={shiftIds.includes(s.id)}
                                                    onChange={() => toggleShift(s.id)}
                                                    className="w-4 h-4 accent-[#13b6ec]"
                                                />
                                                <span>{s.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {recurrence === "shift_days" && shiftIds.length > 0 && (
                                        <p className="mt-1.5 text-[11px] text-[#13b6ec]">
                                            {resolvedShiftDays && resolvedShiftDays.length > 0
                                                ? `Disponível nos dias dos turnos (${selectedShiftLabel}): ${resolvedShiftDays.map((d) => DAYS_SHORT[d]).join(", ")}`
                                                : `Os turnos selecionados não têm dias configurados.`}
                                        </p>
                                    )}
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
                    shiftLabel={shiftEnum === "any" ? null : shiftEnum}
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
                    shiftLabel={shiftEnum === "any" ? null : shiftEnum}
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
                    shiftLabel={shiftEnum === "any" ? null : shiftEnum}
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
                    shiftLabel={shiftEnum === "any" ? null : shiftEnum}
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

            {/* Sprint 92 — remover uma área tira do escopo os responsáveis que só
                pertenciam a ela. Confirmação explícita antes de aplicar. */}
            {pendingAreaRemoval && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-[#16262c] border border-[#233f48] rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-2 text-white">
                            <span className="material-symbols-outlined text-amber-400">group_remove</span>
                            <h3 className="text-xl font-bold tracking-tight">Remover {pendingAreaRemoval.areaName}?</h3>
                        </div>
                        <p className="text-[#92bbc9] text-sm mb-4 mt-2 leading-relaxed">
                            {pendingAreaRemoval.affected.length === 1
                                ? "Este responsável não pertence a nenhuma outra área selecionada e será removido do modelo:"
                                : "Estes responsáveis não pertencem a nenhuma outra área selecionada e serão removidos do modelo:"}
                        </p>
                        <ul className="mb-6 space-y-1">
                            {pendingAreaRemoval.affected.map((a) => (
                                <li key={a.user_id} className="text-sm text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px] text-[#557682]">person</span>
                                    {a.name}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-3 justify-end mt-4">
                            <button
                                type="button"
                                onClick={() => setPendingAreaRemoval(null)}
                                className="px-4 py-2 rounded-lg font-bold text-sm text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmAreaRemoval}
                                className="px-4 py-2 rounded-lg font-bold text-sm bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-white transition-colors"
                            >
                                Remover mesmo assim
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
