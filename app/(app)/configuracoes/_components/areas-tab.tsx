"use client";

import { useState } from "react";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAllAreas, useCreateArea, useUpdateArea, useDeleteArea } from "@/lib/hooks/use-areas";
import { useUserAreasByRestaurant, useAssignUserArea, useRemoveUserArea } from "@/lib/hooks/use-user-areas";
import { useEquipe } from "@/lib/hooks/use-equipe";
import type { Area } from "@/lib/types";

const AREA_COLORS = [
    "#13b6ec",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#a855f7",
    "#ec4899",
    "#92bbc9",
    "#3b82f6",
];

export function AreasTab() {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const userRole = useRestaurantStore((state) => state.userRole);

    const { data: areas = [], isLoading } = useAllAreas(restaurantId || undefined);
    const { data: allAssignments = [] } = useUserAreasByRestaurant(restaurantId || undefined);
    const { data: equipeData } = useEquipe(restaurantId || null);
    const equipe = equipeData?.equipe?.filter((m) => m.active) ?? [];

    const createArea = useCreateArea();
    const updateArea = useUpdateArea();
    const deleteArea = useDeleteArea();
    const assignUser = useAssignUserArea();
    const removeUser = useRemoveUserArea();

    // Area create/edit modal
    const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
    const [editingArea, setEditingArea] = useState<Area | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [formColor, setFormColor] = useState(AREA_COLORS[0]);
    const [formMaxTasks, setFormMaxTasks] = useState("");

    // User assignment modal
    const [assignModalAreaId, setAssignModalAreaId] = useState<string | null>(null);

    // Build area → member list lookup from allAssignments
    const membersByArea = allAssignments.reduce<Record<string, typeof allAssignments>>((acc, a) => {
        if (!acc[a.area_id]) acc[a.area_id] = [];
        acc[a.area_id].push(a);
        return acc;
    }, {});

    const openAreaModal = (area?: Area) => {
        setErrorMsg(null);
        if (area) {
            setEditingArea(area);
            setFormName(area.name);
            setFormDescription(area.description || "");
            setFormColor(area.color);
            setFormMaxTasks(area.max_parallel_tasks != null ? String(area.max_parallel_tasks) : "");
        } else {
            setEditingArea(null);
            setFormName("");
            setFormDescription("");
            setFormColor(AREA_COLORS[0]);
            setFormMaxTasks("");
        }
        setIsAreaModalOpen(true);
    };

    const handleSaveArea = async () => {
        if (!restaurantId || !formName.trim()) return;
        setErrorMsg(null);

        const maxParallelTasks = formMaxTasks.trim() === "" ? null : parseInt(formMaxTasks, 10);
        if (maxParallelTasks !== null && (isNaN(maxParallelTasks) || maxParallelTasks < 1)) {
            setErrorMsg("O limite deve ser vazio (ilimitado) ou um número inteiro >= 1.");
            return;
        }

        try {
            if (editingArea) {
                await updateArea.mutateAsync({
                    id: editingArea.id,
                    restaurant_id: restaurantId,
                    name: formName.trim(),
                    description: formDescription.trim() || undefined,
                    color: formColor,
                    max_parallel_tasks: maxParallelTasks,
                });
            } else {
                await createArea.mutateAsync({
                    restaurant_id: restaurantId,
                    name: formName.trim(),
                    description: formDescription.trim() || undefined,
                    color: formColor,
                    max_parallel_tasks: maxParallelTasks,
                });
            }
            setIsAreaModalOpen(false);
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : "Erro ao salvar área.");
        }
    };

    const handleDeleteArea = async (id: string) => {
        if (!restaurantId) return;
        setErrorMsg(null);
        try {
            await deleteArea.mutateAsync({ id, restaurant_id: restaurantId });
            setDeleteConfirmId(null);
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : "Erro ao excluir área.");
        }
    };

    const handleAssignUser = async (userId: string) => {
        if (!restaurantId || !assignModalAreaId) return;
        try {
            await assignUser.mutateAsync({
                restaurant_id: restaurantId,
                user_id: userId,
                area_id: assignModalAreaId,
            });
        } catch (error) {
            // 409 = already assigned, ignore silently
            if (!(error instanceof Error && error.message.includes("já pertence"))) {
                setErrorMsg(error instanceof Error ? error.message : "Erro ao adicionar membro.");
            }
        }
    };

    const handleRemoveUser = async (assignmentId: string) => {
        if (!restaurantId) return;
        try {
            await removeUser.mutateAsync({ id: assignmentId, restaurant_id: restaurantId });
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : "Erro ao remover membro.");
        }
    };

    const isSaving = createArea.isPending || updateArea.isPending;
    const assignModalArea = areas.find((a) => a.id === assignModalAreaId);
    const assignedUserIds = new Set(
        (membersByArea[assignModalAreaId ?? ""] ?? []).map((a) => a.user_id)
    );

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">Áreas Organizacionais</h2>
                    <p className="text-sm text-[#92bbc9] mt-0.5">
                        Crie áreas e atribua membros para controlar o que cada um vê em &quot;Minhas Atividades&quot;.
                    </p>
                </div>
                <button
                    onClick={() => openAreaModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#13b6ec] text-[#111e22] font-bold text-sm rounded-xl hover:bg-[#10a0d0] transition-colors"
                >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Nova Área
                </button>
            </div>

            {/* Error */}
            {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                    {errorMsg}
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 bg-[#1a2c32] rounded-xl animate-pulse" />
                    ))}
                </div>
            )}

            {/* Empty */}
            {!isLoading && areas.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3 border border-dashed border-[#233f48] rounded-xl">
                    <span className="material-symbols-outlined text-[#325a67] text-4xl">category</span>
                    <p className="text-white font-semibold">Nenhuma área criada</p>
                    <p className="text-[#92bbc9] text-sm max-w-xs">
                        Crie áreas como &quot;Gerência&quot;, &quot;Operações&quot; e atribua membros a cada uma.
                        Rotinas em &quot;Minhas Atividades&quot; só aparecem para membros da área correspondente.
                    </p>
                </div>
            )}

            {/* Area list */}
            {!isLoading && areas.map((area) => {
                const members = membersByArea[area.id] ?? [];
                return (
                    <div
                        key={area.id}
                        className="bg-[#16262c] border border-[#233f48] rounded-xl overflow-hidden"
                    >
                        {/* Area header */}
                        <div className="flex items-center gap-4 p-4">
                            <div
                                className="w-3 h-10 rounded-full shrink-0"
                                style={{ backgroundColor: area.color }}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-sm truncate">{area.name}</p>
                                {area.description && (
                                    <p className="text-[#92bbc9] text-xs truncate mt-0.5">{area.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[#325a67] text-xs">
                                        {members.length} membro{members.length !== 1 ? "s" : ""}
                                    </span>
                                    <span className="text-[#325a67] text-xs">·</span>
                                    <span className="text-[#325a67] text-xs">
                                        {area.max_parallel_tasks != null
                                            ? `Até ${area.max_parallel_tasks} atividade${area.max_parallel_tasks > 1 ? "s" : ""}/pessoa`
                                            : "Ilimitado"}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setAssignModalAreaId(area.id)}
                                    className="p-2 text-[#92bbc9] hover:text-[#13b6ec] hover:bg-[#13b6ec]/10 rounded-lg transition-colors"
                                    title="Gerenciar membros"
                                >
                                    <span className="material-symbols-outlined text-[18px]">group_add</span>
                                </button>
                                <button
                                    onClick={() => openAreaModal(area)}
                                    className="p-2 text-[#92bbc9] hover:text-white hover:bg-[#233f48] rounded-lg transition-colors"
                                    title="Editar área"
                                >
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                {userRole === "owner" && (
                                    deleteConfirmId === area.id ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-[#92bbc9]">Excluir?</span>
                                            <button
                                                onClick={() => handleDeleteArea(area.id)}
                                                disabled={deleteArea.isPending}
                                                className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                                            >
                                                Sim
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirmId(null)}
                                                className="px-2 py-1 bg-[#233f48] text-[#92bbc9] text-xs font-bold rounded-lg hover:bg-[#325a67] transition-colors"
                                            >
                                                Não
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setDeleteConfirmId(area.id)}
                                            className="p-2 text-[#92bbc9] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Excluir área"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Member chips */}
                        {members.length > 0 && (
                            <div className="px-4 pb-4 flex flex-wrap gap-2 border-t border-[#233f48]/50 pt-3">
                                {members.map((assignment) => {
                                    const member = equipe.find((m) => m.user_id === assignment.user_id);
                                    return (
                                        <div
                                            key={assignment.id}
                                            className="flex items-center gap-1.5 bg-[#101d22] border border-[#233f48] px-2.5 py-1 rounded-full text-xs font-medium text-white"
                                        >
                                            <span className="material-symbols-outlined text-[12px] text-[#92bbc9]">person</span>
                                            {member?.name ?? "Membro"}
                                            <button
                                                onClick={() => handleRemoveUser(assignment.id)}
                                                className="ml-0.5 text-[#325a67] hover:text-red-400 transition-colors"
                                                title="Remover da área"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Area create/edit modal */}
            {isAreaModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-6 w-full max-w-md flex flex-col gap-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">
                                {editingArea ? "Editar Área" : "Nova Área"}
                            </h3>
                            <button
                                onClick={() => setIsAreaModalOpen(false)}
                                className="p-1 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#233f48] transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {errorMsg && (
                            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                                {errorMsg}
                            </p>
                        )}

                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Nome *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Ex: Gerência, Diretoria, Operações"
                                    className="w-full bg-[#101d22] border border-[#233f48] rounded-xl px-4 py-3 text-white placeholder-[#325a67] focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Descrição (opcional)</label>
                                <input
                                    type="text"
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder="Breve descrição da área"
                                    className="w-full bg-[#101d22] border border-[#233f48] rounded-xl px-4 py-3 text-white placeholder-[#325a67] focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Cor</label>
                                <div className="flex gap-3 flex-wrap">
                                    {AREA_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => setFormColor(color)}
                                            className={`w-8 h-8 rounded-full border-2 transition-all ${
                                                formColor === color ? "border-white scale-110" : "border-transparent hover:scale-105"
                                            }`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">
                                    Máximo de atividades simultâneas por colaborador
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={formMaxTasks}
                                    onChange={(e) => setFormMaxTasks(e.target.value)}
                                    placeholder="Deixe vazio para ilimitado"
                                    className="w-full bg-[#101d22] border border-[#233f48] rounded-xl px-4 py-3 text-white placeholder-[#325a67] focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all text-sm"
                                />
                                <p className="text-xs text-[#92bbc9] mt-1.5">
                                    {formMaxTasks.trim() === ""
                                        ? "Ilimitado — colaboradores podem assumir quantas atividades quiserem nesta área"
                                        : `Até ${formMaxTasks} atividade${parseInt(formMaxTasks) > 1 ? "s" : ""} por pessoa nesta área`}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setIsAreaModalOpen(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-[#233f48] text-[#92bbc9] font-bold text-sm hover:border-[#325a67] hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveArea}
                                disabled={isSaving || !formName.trim()}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-[#13b6ec] text-[#111e22] font-bold text-sm hover:bg-[#10a0d0] disabled:opacity-50 transition-colors"
                            >
                                {isSaving ? "Salvando..." : "Salvar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* User assignment modal */}
            {assignModalAreaId && assignModalArea && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-6 w-full max-w-md flex flex-col gap-5 max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-3 h-6 rounded-full"
                                    style={{ backgroundColor: assignModalArea.color }}
                                />
                                <h3 className="text-lg font-bold text-white">{assignModalArea.name}</h3>
                            </div>
                            <button
                                onClick={() => setAssignModalAreaId(null)}
                                className="p-1 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#233f48] transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <p className="text-[#92bbc9] text-sm -mt-2">
                            Membros desta área verão rotinas atribuídas a ela em &quot;Minhas Atividades&quot;.
                        </p>

                        <div className="overflow-y-auto flex flex-col gap-2 flex-1">
                            {equipe.length === 0 && (
                                <p className="text-[#325a67] text-sm text-center py-4">Nenhum membro ativo na equipe.</p>
                            )}
                            {equipe.map((member) => {
                                const isAssigned = assignedUserIds.has(member.user_id);
                                const assignment = (membersByArea[assignModalAreaId] ?? []).find(
                                    (a) => a.user_id === member.user_id
                                );
                                return (
                                    <div
                                        key={member.user_id}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                                            isAssigned
                                                ? "bg-[#13b6ec]/10 border-[#13b6ec]/30"
                                                : "bg-[#101d22] border-[#233f48]"
                                        }`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-[#16262c] border border-[#233f48] flex items-center justify-center shrink-0">
                                            <span className="text-white text-xs font-bold uppercase">
                                                {member.name?.charAt(0) ?? "?"}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-semibold truncate">{member.name}</p>
                                            <p className="text-[#92bbc9] text-xs capitalize">{member.role}</p>
                                        </div>
                                        {isAssigned ? (
                                            <button
                                                onClick={() => assignment && handleRemoveUser(assignment.id)}
                                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Remover da área"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleAssignUser(member.user_id)}
                                                disabled={assignUser.isPending}
                                                className="p-1.5 text-[#13b6ec] hover:bg-[#13b6ec]/10 rounded-lg transition-colors disabled:opacity-50"
                                                title="Adicionar à área"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => setAssignModalAreaId(null)}
                            className="w-full px-4 py-2.5 rounded-xl border border-[#233f48] text-[#92bbc9] font-bold text-sm hover:border-[#325a67] hover:text-white transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
