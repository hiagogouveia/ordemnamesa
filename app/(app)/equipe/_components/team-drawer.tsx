"use client";

import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useRoles } from "@/lib/hooks/use-roles";
import { useShifts } from "@/lib/hooks/use-shifts";
import {
    useUserRoles, useCreateUserRole, useDeleteUserRole,
    useUserShifts, useCreateUserShift, useDeleteUserShift
} from "@/lib/hooks/use-user-roles-shifts";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";

interface TeamEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    member: {
        id: string;
        user_id: string;
        name: string;
        email: string;
        avatar?: string;
        role: string;
        active: boolean;
    } | null;
    onUpdated: (id: string, updates: { name?: string; role?: string; active?: boolean }) => void;
}

export function TeamDrawer({ isOpen, onClose, member, onUpdated }: TeamEditModalProps) {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);

    const { data: allRoles = [] } = useRoles(restaurantId || undefined);
    const { data: allShifts = [] } = useShifts(restaurantId || undefined);
    const { data: userRoles = [], isLoading: loadingRoles } = useUserRoles(restaurantId || undefined, member?.user_id || undefined);
    const { data: userShifts = [], isLoading: loadingShifts } = useUserShifts(restaurantId || undefined, member?.user_id || undefined);

    const assignRole = useCreateUserRole();
    const removeRole = useDeleteUserRole();
    const assignShift = useCreateUserShift();
    const removeShift = useDeleteUserShift();

    const [isAddingRole, setIsAddingRole] = useState(false);
    const [isAddingShift, setIsAddingShift] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form fields
    const [editName, setEditName] = useState("");
    const [editRole, setEditRole] = useState("staff");
    const [editActive, setEditActive] = useState(true);

    // Sync when member changes
    useEffect(() => {
        if (member) {
            setEditName(member.name);
            setEditRole(member.role);
            setEditActive(member.active);
        }
        setIsAddingRole(false);
        setIsAddingShift(false);
    }, [member]);

    if (!isOpen || !member) return null;

    const getToken = async () => {
        const { data: { session } } = await createClient().auth.getSession();
        return session?.access_token || '';
    };

    const handleSave = async () => {
        if (!restaurantId) return;
        setSaving(true);
        try {
            const token = await getToken();
            const response = await fetch(`/api/equipe/${member.user_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    name: editName.trim(),
                    role: editRole,
                    active: editActive,
                    restaurant_id: restaurantId
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erro ao salvar');
            }
            onUpdated(member.id, { name: editName.trim(), role: editRole, active: editActive });
        } catch (error) {
            console.error("Erro ao salvar colaborador", error);
            alert((error as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const assignedRoleIds = userRoles.map(ur => ur.role_id);
    const availableRoles = allRoles.filter(r => r.active && !assignedRoleIds.includes(r.id));
    const assignedShiftIds = userShifts.map(us => us.shift_id);
    const availableShifts = allShifts.filter(s => s.active && !assignedShiftIds.includes(s.id));

    const handleAssignRole = async (roleId: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await assignRole.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, role_id: roleId });
            setIsAddingRole(false);
        } catch (error) { console.error("Erro ao atribuir função", error); }
    };

    const handleRemoveRole = async (id: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await removeRole.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, id });
        } catch (error) { console.error("Erro ao remover função", error); }
    };

    const handleAssignShift = async (shiftId: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await assignShift.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, shift_id: shiftId });
            setIsAddingShift(false);
        } catch (error) { console.error("Erro ao atribuir turno", error); }
    };

    const handleRemoveShift = async (id: string) => {
        if (!restaurantId || !member.user_id) return;
        try {
            await removeShift.mutateAsync({ restaurant_id: restaurantId, user_id: member.user_id, id });
        } catch (error) { console.error("Erro ao remover turno", error); }
    };

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                onClick={onClose}
            />

            {/* Modal centralizado */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl pointer-events-auto">

                    {/* Header com avatar + nome */}
                    <div className="p-5 border-b border-[#233f48] flex items-center gap-4 shrink-0">
                        <Avatar src={member.avatar} name={member.name} size={48} border="border-[#13b6ec]" />
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold truncate">{member.name}</p>
                            <p className="text-[#92bbc9] text-xs truncate">{member.email}</p>
                        </div>
                        <button onClick={onClose} className="p-1.5 text-[#92bbc9] hover:text-white hover:bg-[#233f48] rounded-lg transition-colors shrink-0">
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>

                    {/* Scroll content */}
                    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">

                        {/* INFORMAÇÕES PESSOAIS */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Informações Pessoais</h3>

                            <div>
                                <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">Nome completo</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">Cargo</label>
                                <select
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none cursor-pointer"
                                >
                                    <option value="staff">Colaborador</option>
                                    <option value="manager">Gerente</option>
                                    <option value="owner">Proprietário</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between bg-[#101d22] border border-[#233f48] rounded-lg p-3">
                                <div>
                                    <p className="text-white text-sm font-medium">Status</p>
                                    <p className="text-[#92bbc9] text-xs">{editActive ? 'Conta ativa' : 'Conta inativa'}</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-[#233f48] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                                </label>
                            </div>
                        </div>

                        {/* ÁREAS ATRIBUÍDAS */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Áreas Atribuídas</h3>
                            {loadingRoles ? (
                                <div className="animate-pulse flex gap-2"><div className="h-7 w-20 bg-[#233f48] rounded-full"></div></div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {userRoles.map(ur => {
                                        const role = ur.roles || allRoles.find(r => r.id === ur.role_id);
                                        if (!role) return null;
                                        return (
                                            <div key={ur.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium" style={{ borderColor: role.color, color: role.color, backgroundColor: `${role.color}15` }}>
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                                                {role.name}
                                                <button onClick={() => handleRemoveRole(ur.id)} className="hover:opacity-70 transition-opacity ml-0.5">
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {userRoles.length === 0 && <span className="text-xs text-[#325a67]">Nenhuma área atribuída</span>}
                                </div>
                            )}

                            <div className="relative">
                                {isAddingRole ? (
                                    <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-2 max-h-40 overflow-y-auto">
                                        <div className="flex justify-between items-center px-2 py-1 mb-1 border-b border-[#233f48]">
                                            <span className="text-[10px] text-[#92bbc9] uppercase">Selecionar área</span>
                                            <button onClick={() => setIsAddingRole(false)}><span className="material-symbols-outlined text-[16px] text-[#92bbc9]">close</span></button>
                                        </div>
                                        {availableRoles.length === 0 ? (
                                            <p className="text-xs text-[#325a67] px-2 py-2 text-center">Nenhuma área disponível</p>
                                        ) : availableRoles.map(r => (
                                            <button key={r.id} onClick={() => handleAssignRole(r.id)} className="w-full text-left px-2 py-2 hover:bg-[#16262c] rounded-md flex items-center gap-2 text-sm text-white">
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />{r.name}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button onClick={() => setIsAddingRole(true)} className="flex items-center gap-1.5 text-xs text-[#13b6ec] hover:text-white font-medium py-1 px-2 border border-transparent hover:border-[#233f48] rounded-lg transition-colors w-fit">
                                        <span className="material-symbols-outlined text-[16px]">add</span> Adicionar Área
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* TURNOS ATRIBUÍDOS */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Turnos Atribuídos</h3>
                            {loadingShifts ? (
                                <div className="animate-pulse flex gap-2"><div className="h-10 w-32 bg-[#233f48] rounded-lg"></div></div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {userShifts.map(us => {
                                        const shift = us.shifts || allShifts.find(s => s.id === us.shift_id);
                                        if (!shift) return null;
                                        return (
                                            <div key={us.id} className="flex justify-between items-center bg-[#101d22] border border-[#233f48] rounded-lg p-2.5">
                                                <div>
                                                    <p className="text-white text-sm font-bold">{shift.name}</p>
                                                    <p className="text-[#92bbc9] text-[10px]">{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}</p>
                                                </div>
                                                <button onClick={() => handleRemoveShift(us.id)} className="p-1.5 text-[#92bbc9] hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors">
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {userShifts.length === 0 && <span className="text-xs text-[#325a67]">Nenhum turno atribuído</span>}
                                </div>
                            )}

                            <div className="relative">
                                {isAddingShift ? (
                                    <div className="bg-[#101d22] border border-[#233f48] rounded-lg p-2 max-h-40 overflow-y-auto">
                                        <div className="flex justify-between items-center px-2 py-1 mb-1 border-b border-[#233f48]">
                                            <span className="text-[10px] text-[#92bbc9] uppercase">Selecionar turno</span>
                                            <button onClick={() => setIsAddingShift(false)}><span className="material-symbols-outlined text-[16px] text-[#92bbc9]">close</span></button>
                                        </div>
                                        {availableShifts.length === 0 ? (
                                            <p className="text-xs text-[#325a67] px-2 py-2 text-center">Nenhum turno disponível</p>
                                        ) : availableShifts.map(s => (
                                            <button key={s.id} onClick={() => handleAssignShift(s.id)} className="w-full text-left px-2 py-2 hover:bg-[#16262c] rounded-md flex flex-col">
                                                <span className="text-sm text-white font-medium">{s.name}</span>
                                                <span className="text-[#92bbc9] text-[10px]">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button onClick={() => setIsAddingShift(true)} className="flex items-center gap-1.5 text-xs text-[#13b6ec] hover:text-white font-medium py-1 px-2 border border-transparent hover:border-[#233f48] rounded-lg transition-colors w-fit">
                                        <span className="material-symbols-outlined text-[16px]">add</span> Adicionar Turno
                                    </button>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Footer com botões */}
                    <div className="p-4 border-t border-[#233f48] flex gap-3 justify-end shrink-0">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-[#92bbc9] hover:bg-[#233f48] hover:text-white transition-colors">
                            Cancelar
                        </button>
                        <button onClick={handleSave} disabled={saving || !editName.trim()} className="px-5 py-2 rounded-lg text-sm font-bold bg-[#13b6ec] text-[#111e22] hover:bg-cyan-400 disabled:opacity-50 transition-colors">
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
