"use client";

import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useRoles } from "@/lib/hooks/use-roles";
import { useShifts } from "@/lib/hooks/use-shifts";
import {
    useUserRoles, useCreateUserRole, useDeleteUserRole,
    useUserShifts, useCreateUserShift, useDeleteUserShift
} from "@/lib/hooks/use-user-roles-shifts";
import { useState } from "react";

interface TeamDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    member: { id: string; user_id: string; name: string; email: string; avatar?: string } | null;
}

export function TeamDrawer({ isOpen, onClose, member }: TeamDrawerProps) {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);

    // Base data
    const { data: allRoles = [] } = useRoles(restaurantId || undefined);
    const { data: allShifts = [] } = useShifts(restaurantId || undefined);

    // User data
    const { data: userRoles = [], isLoading: loadingRoles } = useUserRoles(restaurantId || undefined, member?.user_id || undefined);
    const { data: userShifts = [], isLoading: loadingShifts } = useUserShifts(restaurantId || undefined, member?.user_id || undefined);

    // Mutations
    const assignRole = useCreateUserRole();
    const removeRole = useDeleteUserRole();
    const assignShift = useCreateUserShift();
    const removeShift = useDeleteUserShift();

    const [isAddingRole, setIsAddingRole] = useState(false);
    const [isAddingShift, setIsAddingShift] = useState(false);

    if (!isOpen || !member) return null;

    const assignedRoleIds = userRoles.map(ur => ur.role_id);
    const availableRoles = allRoles.filter(r => r.active && !assignedRoleIds.includes(r.id));

    const assignedShiftIds = userShifts.map(us => us.shift_id);
    const availableShifts = allShifts.filter(s => s.active && !assignedShiftIds.includes(s.id));

    const handleAssignRole = async (roleId: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await assignRole.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, role_id: roleId });
            setIsAddingRole(false);
        } catch (error) {
            console.error("Erro ao atribuir função", error);
        }
    };

    const handleRemoveRole = async (id: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await removeRole.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, id });
        } catch (error) {
            console.error("Erro ao remover função", error);
        }
    };

    const handleAssignShift = async (shiftId: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await assignShift.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, shift_id: shiftId });
            setIsAddingShift(false);
        } catch (error) {
            console.error("Erro ao atribuir turno", error);
        }
    };

    const handleRemoveShift = async (id: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await removeShift.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, id });
        } catch (error) {
            console.error("Erro ao remover turno", error);
        }
    };

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Drawer */}
            <div className={`fixed inset-y-0 right-0 w-80 bg-[#1a2c32] border-l border-[#233f48] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header */}
                <div className="p-6 border-b border-[#233f48] flex flex-col gap-4 relative shrink-0">
                    <button onClick={onClose} className="absolute top-4 right-4 text-[#92bbc9] hover:text-white transition-colors bg-[#16262c] p-1.5 rounded-lg border border-[#233f48]">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>

                    <div className="flex items-center gap-4">
                        {member.avatar ? (
                            <div className="w-16 h-16 rounded-full bg-cover bg-center border-2 border-[#13b6ec]" style={{ backgroundImage: `url(${member.avatar})` }} />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-[#111e22] border-2 border-[#13b6ec] flex items-center justify-center text-white text-xl font-bold">
                                {member.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="flex flex-col min-w-0 pr-6">
                            <h2 className="text-white font-bold text-lg truncate" title={member.name}>{member.name}</h2>
                            <p className="text-[#92bbc9] text-xs truncate" title={member.email}>{member.email}</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
                    {/* Resumo Hoje */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Resumo Hoje</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-3 flex flex-col gap-1">
                                <span className="text-[#13b6ec] font-bold text-lg">0</span>
                                <span className="text-[10px] text-[#92bbc9] leading-tight text-center">Em andamento</span>
                            </div>
                            <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-3 flex flex-col gap-1">
                                <span className="text-emerald-400 font-bold text-lg">0</span>
                                <span className="text-[10px] text-[#92bbc9] leading-tight text-center">Concluídas</span>
                            </div>
                            <div className="col-span-2 bg-[#16262c] border border-red-500/20 rounded-xl p-3 flex items-center justify-between">
                                <span className="text-[10px] text-red-400 leading-tight">Impedimentos ativos</span>
                                <span className="text-red-400 font-bold text-lg leading-none">0</span>
                            </div>
                        </div>
                    </div>

                    {/* Funções Atribuídas */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Funções Atribuídas</h3>

                        {loadingRoles ? (
                            <div className="animate-pulse flex gap-2"><div className="h-8 w-20 bg-[#233f48] rounded-full"></div></div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {userRoles.map(ur => {
                                    const role = ur.roles || allRoles.find(r => r.id === ur.role_id);
                                    if (!role) return null;
                                    return (
                                        <div key={ur.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-opacity-10 text-xs font-medium" style={{ borderColor: role.color, color: role.color, backgroundColor: `${role.color}15` }}>
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                                            {role.name}
                                            <button onClick={() => handleRemoveRole(ur.id)} className="hover:text-white transition-colors ml-1">
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        </div>
                                    );
                                })}
                                {userRoles.length === 0 && (
                                    <span className="text-xs text-[#325a67]">Nenhuma função</span>
                                )}
                            </div>
                        )}

                        <div className="relative mt-1">
                            {isAddingRole ? (
                                <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-2 absolute w-full z-10 shadow-xl max-h-48 overflow-y-auto">
                                    <div className="flex justify-between items-center px-2 py-1 mb-2 border-b border-[#233f48]">
                                        <span className="text-[10px] text-[#92bbc9] uppercase">Selecione uma função</span>
                                        <button onClick={() => setIsAddingRole(false)} className="text-[#92bbc9] hover:text-white">
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    </div>
                                    {availableRoles.length === 0 ? (
                                        <div className="px-2 py-3 text-xs text-[#325a67] text-center">Nenhuma função disponível</div>
                                    ) : (
                                        availableRoles.map(r => (
                                            <button
                                                key={r.id}
                                                onClick={() => handleAssignRole(r.id)}
                                                className="w-full text-left px-2 py-2 hover:bg-[#16262c] rounded-md transition-colors flex items-center gap-2 text-sm text-white"
                                            >
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                                                <span className="truncate">{r.name}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsAddingRole(true)}
                                    className="flex items-center gap-1.5 text-xs text-[#13b6ec] hover:text-white transition-colors py-1 py-1.5 font-medium border border-transparent hover:border-[#233f48] rounded-lg px-2 w-fit"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span> Adicionar Função
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Turnos Atribuídos */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Turnos Atribuídos</h3>

                        {loadingShifts ? (
                            <div className="animate-pulse flex gap-2"><div className="h-8 w-24 bg-[#233f48] rounded-full"></div></div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {userShifts.map(us => {
                                    const shift = us.shifts || allShifts.find(s => s.id === us.shift_id);
                                    if (!shift) return null;
                                    return (
                                        <div key={us.id} className="flex justify-between items-center bg-[#16262c] border border-[#233f48] rounded-lg p-2.5">
                                            <div className="flex flex-col">
                                                <span className="text-white text-sm font-bold">{shift.name}</span>
                                                <span className="text-[#92bbc9] text-[10px]">{shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}</span>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveShift(us.id)}
                                                className="p-1.5 text-[#92bbc9] hover:text-red-400 hover:bg-[#1a2c32] rounded-md transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                            </button>
                                        </div>
                                    );
                                })}
                                {userShifts.length === 0 && (
                                    <span className="text-xs text-[#325a67]">Nenhum turno</span>
                                )}
                            </div>
                        )}

                        <div className="relative mt-1">
                            {isAddingShift ? (
                                <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-2 absolute w-full z-10 shadow-xl max-h-48 overflow-y-auto">
                                    <div className="flex justify-between items-center px-2 py-1 mb-2 border-b border-[#233f48]">
                                        <span className="text-[10px] text-[#92bbc9] uppercase">Selecione um turno</span>
                                        <button onClick={() => setIsAddingShift(false)} className="text-[#92bbc9] hover:text-white">
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    </div>
                                    {availableShifts.length === 0 ? (
                                        <div className="px-2 py-3 text-xs text-[#325a67] text-center">Nenhum turno disponível</div>
                                    ) : (
                                        availableShifts.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => handleAssignShift(s.id)}
                                                className="w-full text-left px-2 py-2 hover:bg-[#16262c] rounded-md transition-colors flex flex-col"
                                            >
                                                <span className="text-sm text-white font-medium">{s.name}</span>
                                                <span className="text-[#92bbc9] text-[10px]">{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsAddingShift(true)}
                                    className="flex items-center gap-1.5 text-xs text-[#13b6ec] hover:text-white transition-colors py-1.5 font-medium border border-transparent hover:border-[#233f48] rounded-lg px-2 w-fit"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span> Adicionar Turno
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
