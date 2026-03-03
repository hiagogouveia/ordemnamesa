"use client";

import { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskItem } from "./task-item";
import { ExtendedChecklist } from "./checklist-card";
import { useCreateChecklist, useUpdateChecklist, useDeleteChecklist } from "@/lib/hooks/use-checklists";
import { ChecklistTask } from "@/lib/types";
import { useRestaurantStore } from "@/lib/store/restaurant-store";

interface ChecklistFormProps {
    checklist: ExtendedChecklist | null;
    onSaved: () => void;
    onCancel: () => void;
}

const CATEGORIES = ["Bartender", "Garçom", "Cozinheiro", "Gerente", "Equipe Limpeza", "Supervisor"];
const SHIFTS = [
    { value: 'morning', label: 'Manhã' },
    { value: 'afternoon', label: 'Tarde' },
    { value: 'evening', label: 'Noite' },
    { value: 'any', label: 'Qualquer turno' }
];

export function ChecklistForm({ checklist, onSaved, onCancel }: ChecklistFormProps) {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [shift, setShift] = useState("any");
    const [category, setCategory] = useState("");
    const [tasks, setTasks] = useState<(Partial<ChecklistTask> & { tempId: string })[]>([]);

    const createMutation = useCreateChecklist();
    const updateMutation = useUpdateChecklist();
    const deleteMutation = useDeleteChecklist();

    useEffect(() => {
        if (checklist) {
            setName(checklist.name);
            setDescription(checklist.description || "");
            setShift(checklist.shift);
            setCategory(checklist.category || "");
            setTasks(
                (checklist.tasks || []).map((t) => ({ ...t, tempId: t.id }))
            );
        } else {
            setName("");
            setDescription("");
            setShift("any");
            setCategory("");
            setTasks([]);
        }
    }, [checklist]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setTasks((items) => {
                const oldIndex = items.findIndex((i) => i.tempId === active.id);
                const newIndex = items.findIndex((i) => i.tempId === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const addTask = () => {
        setTasks([...tasks, { tempId: Math.random().toString(), title: "", is_critical: false, requires_photo: false }]);
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
            category,
            status: (isPublishing ? 'active' : 'draft') as "active" | "draft" | "archived",
            tasks: tasks.map(t => ({
                title: t.title,
                description: t.description,
                is_critical: t.is_critical,
                requires_photo: t.requires_photo
            }))
        };

        try {
            if (checklist?.id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await updateMutation.mutateAsync({ id: checklist.id, ...payload } as any);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await createMutation.mutateAsync(payload as any);
            }
            onSaved();
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar checklist!");
        }
    };

    const handleDelete = async () => {
        if (!checklist?.id || !restaurantId) return;
        if (confirm("Tem certeza que deseja deletar este checklist?")) {
            await deleteMutation.mutateAsync({ id: checklist.id, restaurantId });
            onSaved();
        }
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a1215]">
            {/* Header Actions */}
            <div className="flex items-center justify-between p-6 border-b border-[#233f48] shrink-0 bg-[#101d22]">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                        {checklist ? "Editar Rotina" : "Nova Rotina"}
                    </h2>
                    <p className="text-sm text-[#92bbc9] mt-1">
                        Defina os detalhes e tarefas da lista
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {checklist && (
                        <button
                            onClick={handleDelete}
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
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Função Responsável</label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                                >
                                    <option value="">Selecione...</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Seção das Tarefas */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">Tarefas da Rotina</h3>
                            <button
                                onClick={addTask}
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
                                            onUpdate={updateTask}
                                            onRemove={removeTask}
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
        </div>
    );
}
