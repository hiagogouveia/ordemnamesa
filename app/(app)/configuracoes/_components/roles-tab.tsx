"use client";

import { useRoles, useCreateRole, useUpdateRole } from "@/lib/hooks/use-roles";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { Role } from "@/lib/types";
import { useState } from "react";

const ROLE_COLORS = [
    "#13b6ec", // primary
    "#22c55e", // success
    "#f59e0b", // warning
    "#ef4444", // error
    "#a855f7", // purple
    "#ec4899", // pink
    "#92bbc9", // muted
];

export function RolesTab() {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const { data: roles = [], isLoading } = useRoles(restaurantId || undefined);
    const createRole = useCreateRole();
    const updateRole = useUpdateRole();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    const [formName, setFormName] = useState("");
    const [formColor, setFormColor] = useState(ROLE_COLORS[0]);
    const [formMaxTasks, setFormMaxTasks] = useState("1");
    const [formCanLaunch, setFormCanLaunch] = useState(false);

    const activeRoles = roles.filter(r => r.active);

    const openModal = (role?: Role) => {
        if (role) {
            setEditingRole(role);
            setFormName(role.name);
            setFormColor(role.color);
            setFormMaxTasks(role.max_concurrent_tasks.toString());
            setFormCanLaunch(role.can_launch_purchases);
        } else {
            setEditingRole(null);
            setFormName("");
            setFormColor(ROLE_COLORS[0]);
            setFormMaxTasks("1");
            setFormCanLaunch(false);
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!restaurantId || !formName || !formColor || !formMaxTasks) return;

        try {
            if (editingRole) {
                await updateRole.mutateAsync({
                    restaurant_id: restaurantId,
                    id: editingRole.id,
                    name: formName,
                    color: formColor,
                    max_concurrent_tasks: parseInt(formMaxTasks) || 1,
                    can_launch_purchases: formCanLaunch,
                });
            } else {
                await createRole.mutateAsync({
                    restaurant_id: restaurantId,
                    name: formName,
                    color: formColor,
                    max_concurrent_tasks: parseInt(formMaxTasks) || 1,
                    can_launch_purchases: formCanLaunch,
                    active: true,
                });
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Erro ao salvar função", error);
            alert("Erro ao salvar função. Tente novamente.");
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#13b6ec]"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">Funções e Áreas</h2>
                    <p className="text-sm text-[#92bbc9]">
                        Crie funções (ex: Cozinha, Bar, Salão) e configure regras de operação para sua equipe.
                    </p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="flex items-center justify-center gap-2 bg-[#13b6ec] text-[#101d22] px-4 py-2.5 rounded-lg font-semibold hover:bg-white hover:text-[#101d22] transition-colors whitespace-nowrap"
                >
                    <span className="material-symbols-outlined text-xl">add</span>
                    Nova Função
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeRoles.length === 0 && (
                    <div className="col-span-full bg-[#16262c] border border-[#233f48] rounded-xl p-8 text-center flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#1a2c32] flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-[#325a67]">badge</span>
                        </div>
                        <h3 className="text-white font-medium mb-1">Nenhuma função cadastrada</h3>
                        <p className="text-sm text-[#92bbc9]">Crie uma área ou função para começar a gerenciar.</p>
                    </div>
                )}
                {activeRoles.map((role) => (
                    <div key={role.id} className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 flex flex-col hover:border-[#325a67] transition-colors group">
                        <div className="flex justify-between items-start mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }}></div>
                                <h3 className="text-white font-bold text-lg">{role.name}</h3>
                            </div>
                            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => openModal(role)}
                                    className="p-1.5 text-[#92bbc9] hover:text-[#13b6ec] hover:bg-[#16262c] rounded-lg transition-colors"
                                    title="Editar"
                                >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                            </div>
                        </div>

                        <div className="mt-auto flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-sm text-[#92bbc9] bg-[#16262c] px-3 py-2 rounded-lg border border-[#233f48]">
                                <span className="material-symbols-outlined text-[18px]">list_alt</span>
                                <span>Máx <strong>{role.max_concurrent_tasks}</strong> tarefas simultâneas</span>
                            </div>
                            {role.can_launch_purchases && (
                                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/5 px-3 py-2 rounded-lg border border-emerald-400/20">
                                    <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                                    <span>Pode lançar compras</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Função */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#16262c] rounded-2xl w-full max-w-md border border-[#233f48] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-[#233f48] flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white">
                                {editingRole ? "Editar Função" : "Nova Função"}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-[#92bbc9] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[#92bbc9]">Nome da Função/Área</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Ex: Cozinha, Garçom, Bar..."
                                    className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors"
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-[#92bbc9]">Cor de Identificação</label>
                                <div className="flex gap-3">
                                    {ROLE_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => setFormColor(color)}
                                            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                                            style={{ backgroundColor: color }}
                                        >
                                            {formColor === color && (
                                                <span className="material-symbols-outlined text-[#101d22] font-bold text-xl">
                                                    check
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[#92bbc9]">
                                    Máx. de tarefas simultâneas (1 a 5)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={formMaxTasks}
                                    onChange={(e) => setFormMaxTasks(e.target.value)}
                                    className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-3 bg-[#101d22] p-4 rounded-xl border border-[#233f48]">
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={formCanLaunch}
                                        onChange={(e) => setFormCanLaunch(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                                </label>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-white">Lançar Compras</span>
                                    <span className="text-xs text-[#92bbc9]">Permite que esta função abra listas e registre itens recebidos</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-[#233f48] flex gap-3 shrink-0 bg-[#111e22]">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 px-4 py-3 rounded-lg font-medium text-[#92bbc9] hover:text-white hover:bg-[#1a2c32] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formName || !formColor || !formMaxTasks || createRole.isPending || updateRole.isPending}
                                className="flex-1 bg-[#13b6ec] text-[#101d22] px-4 py-3 rounded-lg font-bold hover:bg-white transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {(createRole.isPending || updateRole.isPending) ? (
                                    <div className="w-5 h-5 border-2 border-[#101d22] border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    "Salvar Função"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
