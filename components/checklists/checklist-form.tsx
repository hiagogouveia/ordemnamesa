"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RecurrencePicker } from "./recurrence-picker-modal";
import type { RecurrenceConfig } from "@/lib/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskItem } from "./task-item";
import { ExtendedChecklist } from "./checklist-card";
import { useCreateChecklist, useUpdateChecklist, useDeleteChecklist, useReorderTasks } from "@/lib/hooks/use-checklists";
import { ChecklistTask } from "@/lib/types";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useRoles } from "@/lib/hooks/use-roles";
import { useEquipe } from "@/lib/hooks/use-equipe";

interface ChecklistFormProps {
    checklist: ExtendedChecklist | null;
    onSaved: () => void;
    onCancel: () => void;
    disableReorder?: boolean;
}

const SHIFTS = [
    { value: 'morning', label: 'Manhã' },
    { value: 'afternoon', label: 'Tarde' },
    { value: 'evening', label: 'Noite' },
    { value: 'any', label: 'Qualquer turno' }
];
const RECURRENCE_OPTIONS = [
    { value: 'none', label: 'Não se repete' },
    { value: 'daily', label: 'Todos os dias' },
    { value: 'weekdays', label: 'Dias úteis (seg-sex)' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'yearly', label: 'Anual' },
    { value: 'custom', label: 'Personalizar...' },
];
const CHECKLIST_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'opening', label: 'Abertura' },
    { value: 'closing', label: 'Fechamento' },
    { value: 'receiving', label: 'Recebimento' }
];

export function ChecklistForm({ checklist, onSaved, onCancel, disableReorder = false }: ChecklistFormProps) {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [shift, setShift] = useState("any");
    const [checklistType, setChecklistType] = useState("regular");
    const [roleId, setRoleId] = useState("");
    const [assignedToUserId, setAssignedToUserId] = useState("");
    const [isRequired, setIsRequired] = useState(true);
    const [recurrence, setRecurrence] = useState("none");
    // Sprint 8: Time window
    const [hasTimeWindow, setHasTimeWindow] = useState(false);
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    // Sprint 8: Custom recurrence
    const [recurrenceConfig, setRecurrenceConfig] = useState<RecurrenceConfig | undefined>(undefined);
    // Sequence order
    const [enforceSequentialOrder, setEnforceSequentialOrder] = useState(false);
    const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
    const taskInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [tasks, setTasks] = useState<(Partial<ChecklistTask> & { tempId: string })[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const { data: roles = [] } = useRoles(restaurantId || undefined);
    const { data: equipeData } = useEquipe(restaurantId || null);
    const equipe = equipeData?.equipe || [];

    const createMutation = useCreateChecklist();
    const updateMutation = useUpdateChecklist();
    const deleteMutation = useDeleteChecklist();
    const reorderMutation = useReorderTasks();

    useEffect(() => {
        if (checklist) {
            setName(checklist.name);
            setDescription(checklist.description || "");
            setShift(checklist.shift);
            setChecklistType(checklist.checklist_type || "regular");
            setRoleId(checklist.role_id || "");
            setAssignedToUserId(checklist.assigned_to_user_id || "");
            setIsRequired(checklist.is_required ?? true);
            setRecurrence(checklist.recurrence || "none");
            // Sprint 8: time window
            const st = checklist.start_time as string | undefined;
            const et = checklist.end_time as string | undefined;
            setStartTime(st || "");
            setEndTime(et || "");
            setHasTimeWindow(!!(st || et));
            // Sprint 8: recurrence config
            setRecurrenceConfig(checklist.recurrence_config as RecurrenceConfig | undefined);
            setEnforceSequentialOrder(checklist.enforce_sequential_order ?? false);
            setTasks(
                (checklist.tasks || []).map((t) => ({ ...t, tempId: t.id }))
            );
        } else {
            setName("");
            setDescription("");
            setShift("any");
            setChecklistType("regular");
            setRoleId("");
            setAssignedToUserId("");
            setIsRequired(true);
            setRecurrence("none");
            setStartTime("");
            setEndTime("");
            setHasTimeWindow(false);
            setRecurrenceConfig(undefined);
            setEnforceSequentialOrder(false);
            setTasks([]);
            setErrorMsg(null);
            setShowDeleteModal(false);
        }
    }, [checklist]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const previousTasks = tasks; // snapshot para rollback

        const oldIndex = previousTasks.findIndex(i => i.tempId === active.id);
        const newIndex = previousTasks.findIndex(i => i.tempId === over.id);
        const newTasks = arrayMove(previousTasks, oldIndex, newIndex);

        setTasks(newTasks); // optimistic UI imediato

        // Não persistir se: checklist não salvo, reorder desabilitado, sem restaurantId
        if (!checklist?.id || !restaurantId || disableReorder) return;

        // Apenas tasks com ID real no banco (exclui tasks novas não salvas)
        const taskOrders = newTasks
            .filter(t => t.id)
            .map((t, index) => ({ id: t.id as string, order: index }));

        if (taskOrders.length === 0) return;

        try {
            await reorderMutation.mutateAsync({ checklistId: checklist.id, restaurantId, taskOrders });
        } catch (e) {
            setTasks(previousTasks); // rollback
            setErrorMsg(e instanceof Error ? e.message : 'Erro ao salvar ordem das tarefas');
        }
    };

    const addTask = (afterTempId?: string) => {
        const newTempId = Math.random().toString();
        const newTask = { tempId: newTempId, title: "", is_critical: false, requires_photo: false };
        if (afterTempId) {
            setTasks(prev => {
                const idx = prev.findIndex(t => t.tempId === afterTempId);
                const next = [...prev];
                next.splice(idx + 1, 0, newTask);
                return next;
            });
        } else {
            setTasks(prev => [...prev, newTask]);
        }
        setTimeout(() => { taskInputRefs.current[newTempId]?.focus(); }, 50);
    };

    const updateTask = (id: string, updates: Partial<ChecklistTask>) => {
        setTasks(tasks.map((t) => (t.tempId === id ? { ...t, ...updates } : t)));
    };

    const removeTask = (id: string) => {
        setTasks(tasks.filter((t) => t.tempId !== id));
    };

    const handleSave = async (isPublishing: boolean) => {
        if (!name.trim() || !restaurantId) return;

        const payload = {
            restaurant_id: restaurantId,
            name,
            description,
            shift: shift as "morning" | "afternoon" | "evening" | "any",
            checklist_type: checklistType as "regular" | "opening" | "closing" | "receiving",
            role_id: roleId || undefined,
            assigned_to_user_id: assignedToUserId || undefined,
            is_required: isRequired,
            recurrence,
            // Sprint 8: time window
            start_time: hasTimeWindow && startTime ? startTime : null,
            end_time: hasTimeWindow && endTime ? endTime : null,
            // Sprint 8: custom recurrence config
            recurrence_config: recurrence === 'custom' ? recurrenceConfig : null,
            enforce_sequential_order: enforceSequentialOrder,
            status: (isPublishing ? 'active' : 'draft') as "active" | "draft" | "archived",
            tasks: tasks.map(t => ({
                title: t.title,
                description: t.description,
                is_critical: t.is_critical,
                requires_photo: t.requires_photo,
                assigned_to_user_id: t.assigned_to_user_id || undefined
            }))
        };

        try {
            setErrorMsg(null);
            if (checklist?.id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await updateMutation.mutateAsync({ id: checklist.id, ...payload } as any);
                onSaved();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const res = await createMutation.mutateAsync(payload as any);
                if (checklistType === 'receiving') {
                    window.location.href = `/compras?new=true&checklist_id=${res.id}`; // Simple redirect
                } else {
                    onSaved();
                }
            }
        } catch (e) {
            console.error(e);
            setErrorMsg(e instanceof Error ? e.message : "Erro inesperado ao salvar a rotina!");
        }
    };

    const handleDelete = async () => {
        if (!checklist?.id || !restaurantId) return;
        try {
            await deleteMutation.mutateAsync({ id: checklist.id, restaurantId });
            setShowDeleteModal(false);
            onSaved();
            // Adicionalmente aqui pode ser add um toast se for importado
        } catch (e) {
            console.error(e);
            setErrorMsg("Erro ao arquivar a rotina.");
            setShowDeleteModal(false);
        }
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;

    const handleRecurrenceChange = useCallback((value: string) => {
        if (value === 'custom') {
            setShowRecurrencePicker(true);
            // Keep previous recurrence until user confirms
        } else {
            setRecurrence(value);
            setRecurrenceConfig(undefined);
        }
    }, []);

    const getRecurrenceLabel = () => {
        if (recurrence !== 'custom' || !recurrenceConfig) return null;
        const freqLabel = recurrenceConfig.frequency === 'daily' ? 'dia(s)' : recurrenceConfig.frequency === 'weekly' ? 'semana(s)' : 'mês(es)';
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const dayNames = recurrenceConfig.days_of_week?.map(d => days[d]).join(', ') || '';
        let label = `A cada ${recurrenceConfig.interval} ${freqLabel}`;
        if (dayNames) label += ` nas ${dayNames}`;
        if (recurrenceConfig.end_type === 'date' && recurrenceConfig.end_date) label += ` até ${recurrenceConfig.end_date}`;
        if (recurrenceConfig.end_type === 'count' && recurrenceConfig.end_count) label += `, ${recurrenceConfig.end_count} vez(es)`;
        return label;
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a1215]">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b border-[#233f48] shrink-0 bg-[#101d22] gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                        {checklist ? "Editar Rotina" : "Nova Rotina"}
                    </h2>
                    <p className="text-sm text-[#92bbc9] mt-1">
                        Defina os detalhes e tarefas da lista
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end w-full sm:w-auto">
                    {checklist && (
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="p-2 text-[#92bbc9] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Excluir"
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>
                    )}
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg font-bold text-sm text-[#92bbc9] hover:bg-[#16262c] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={isLoading || !name.trim()}
                        className="px-4 py-2 rounded-lg font-bold text-sm bg-[#16262c] text-white border border-[#233f48] hover:border-[#325a67] disabled:opacity-50 transition-colors"
                    >
                        Salvar Rascunho
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={isLoading || !name.trim()}
                        className="px-4 py-2 rounded-lg font-bold text-sm bg-[#13b6ec] text-[#111e22] hover:bg-[#10a0d0] shadow-[0_4px_14px_0_rgba(19,182,236,0.2)] disabled:opacity-50 transition-all"
                    >
                        {isLoading ? "Salvando..." : "Publicar"}
                    </button>
                </div>
            </div>

            {/* Formulário Content */}
            <div className="flex-1 overflow-y-auto px-6 py-8">
                <div className="max-w-3xl mx-auto space-y-8">

                    {errorMsg && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl flex items-center gap-3">
                            <span className="material-symbols-outlined shrink-0 text-xl">error</span>
                            <p className="text-sm font-medium">{errorMsg}</p>
                        </div>
                    )}

                    {/* Card Detalhes Básico */}
                    <div className="bg-[#101d22] border border-[#233f48] rounded-2xl p-6 space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Nome da Lista *</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Abertura do Salão"
                                className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all placeholder:text-[#325a67]"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Descrição</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Instruções gerais para esta rotina..."
                                rows={3}
                                className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all resize-none placeholder:text-[#325a67]"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Turno</label>
                                <select
                                    value={shift}
                                    onChange={(e) => setShift(e.target.value)}
                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                                >
                                    {SHIFTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Repetição</label>
                                <select
                                    value={recurrence}
                                    onChange={(e) => handleRecurrenceChange(e.target.value)}
                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                                >
                                    {RECURRENCE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                {recurrence === 'custom' && recurrenceConfig && (
                                    <button
                                        type="button"
                                        onClick={() => setShowRecurrencePicker(true)}
                                        className="mt-2 w-full text-left px-3 py-2 bg-[#13b6ec]/10 border border-[#13b6ec]/30 rounded-lg text-[#13b6ec] text-xs font-medium flex items-center justify-between gap-2 hover:bg-[#13b6ec]/20 transition-colors"
                                    >
                                        <span className="truncate">{getRecurrenceLabel()}</span>
                                        <span className="material-symbols-outlined text-[14px] shrink-0">edit</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Tipo de Rotina</label>
                                <select
                                    value={checklistType}
                                    onChange={(e) => setChecklistType(e.target.value)}
                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                                >
                                    {CHECKLIST_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Área (Função)</label>
                                <select
                                    value={roleId}
                                    onChange={(e) => setRoleId(e.target.value)}
                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                                >
                                    <option value="">Qualquer Área</option>
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Atribuir a colaborador específico (opcional)</label>
                            <select
                                value={assignedToUserId}
                                onChange={(e) => setAssignedToUserId(e.target.value)}
                                className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                            >
                                <option value="">Disponível para toda a área</option>
                                {equipe.filter(m => m.active).map(m => (
                                    <option key={m.user_id} value={m.user_id}>{m.name}</option>
                                ))}
                            </select>
                            {assignedToUserId && (
                                <p className="text-xs text-[#92bbc9] mt-1.5">Apenas este colaborador verá esta rotina no turno.</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="flex items-center gap-3 p-3 bg-[#16262c] border border-[#233f48] rounded-xl">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isRequired}
                                        onChange={(e) => setIsRequired(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                                </label>
                                <div>
                                    <h4 className="text-white text-sm font-bold">Obrigatório</h4>
                                    <p className="text-[#92bbc9] text-xs">Exigir conclusão no painel de turno</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-[#16262c] border border-[#233f48] rounded-xl">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={enforceSequentialOrder}
                                        onChange={(e) => setEnforceSequentialOrder(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                                </label>
                                <div>
                                    <h4 className="text-white text-sm font-bold">Ordem Sequencial</h4>
                                    <p className="text-[#92bbc9] text-xs">Concluir uma a uma nesta ordem</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Seção: Janela de Horário */}
                    <div className="bg-[#101d22] border border-[#233f48] rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-white font-bold text-sm">Janela de Horário</h3>
                                <p className="text-[#92bbc9] text-xs mt-0.5">Define quando a atividade fica disponível</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={hasTimeWindow}
                                    onChange={(e) => setHasTimeWindow(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                            </label>
                        </div>

                        {hasTimeWindow && (
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Início</label>
                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Fim</label>
                                    <input
                                        type="time"
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                                    />
                                </div>
                                {startTime && endTime && (
                                    <p className="col-span-2 text-[#13b6ec] text-xs font-medium">
                                        Disponível das {startTime} às {endTime}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Seção das Tarefas */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">Tarefas da Rotina</h3>
                            <button
                                onClick={() => addTask()}
                                className="flex items-center gap-1.5 text-sm font-bold text-[#13b6ec] hover:text-[#10a0d0] px-3 py-1.5 rounded-lg hover:bg-[#13b6ec]/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">add</span>
                                Adicionar Tarefa
                            </button>
                        </div>

                        <div className="space-y-3">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={tasks.map(t => t.tempId)} strategy={verticalListSortingStrategy}>
                                    {tasks.map((task) => (
                                        <TaskItem
                                            key={task.tempId}
                                            task={task}
                                            equipe={equipe}
                                            onUpdate={updateTask}
                                            onRemove={removeTask}
                                            onEnter={() => addTask(task.tempId)}
                                            setInputRef={(el) => { taskInputRefs.current[task.tempId] = el; }}
                                            disableReorder={disableReorder}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>

                            {tasks.length === 0 && (
                                <div className="text-center p-8 border border-dashed border-[#325a67] rounded-xl text-[#92bbc9]">
                                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">list_alt</span>
                                    <p className="text-sm">Nenhuma tarefa adicionada.</p>
                                    <p className="text-xs mt-1">Comece clicando em &quot;Adicionar Tarefa&quot; acima.</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Modal de Recorrência Personalizada */}
            {showRecurrencePicker && (
                <RecurrencePicker
                    initial={recurrenceConfig}
                    onConfirm={(config) => {
                        setRecurrenceConfig(config);
                        setRecurrence('custom');
                        setShowRecurrencePicker(false);
                    }}
                    onCancel={() => {
                        setShowRecurrencePicker(false);
                        // If no config was set before, revert to 'none'
                        if (!recurrenceConfig) {
                            setRecurrence('none');
                        }
                    }}
                />
            )}

            {/* Modal de Arquivamento */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-[#16262c] border border-[#233f48] rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-fade-in">
                        <div className="flex items-center gap-3 mb-2 text-white">
                            <span className="material-symbols-outlined text-red-500">archive</span>
                            <h3 className="text-xl font-bold tracking-tight">Arquivar rotina?</h3>
                        </div>
                        <p className="text-[#92bbc9] text-sm mb-6 mt-2 leading-relaxed">
                            Esta ação desativará a lista para futuros turnos. Ela não será completamente deletada,
                            mantendo o histórico existente.
                        </p>
                        <div className="flex gap-3 justify-end mt-4">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 rounded-lg font-bold text-sm text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors"
                                disabled={deleteMutation.isPending}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteMutation.isPending}
                                className="px-4 py-2 rounded-lg font-bold text-sm bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                            >
                                {deleteMutation.isPending ? "Arquivando..." : "Confirmar Arquivamento"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
