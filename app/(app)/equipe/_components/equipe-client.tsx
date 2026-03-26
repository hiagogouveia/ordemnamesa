"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEquipe, useUpdateEquipeMember, EquipeData } from '@/lib/hooks/use-equipe';
import { useRoles } from '@/lib/hooks/use-roles';
import { useShifts } from '@/lib/hooks/use-shifts';
import { TeamDrawer } from './team-drawer';
import { Avatar } from '@/components/ui/avatar';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function EquipeSkeleton() {
    return (
        <div className="flex-1 p-4 md:p-8 bg-[#101d22] animate-pulse">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                {/* header */}
                <div className="flex items-center justify-between">
                    <div className="h-8 w-48 rounded bg-[#233f48]" />
                    <div className="h-10 w-36 rounded-lg bg-[#233f48]" />
                </div>
                {/* metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] flex flex-col gap-3">
                            <div className="h-3 w-20 rounded bg-[#233f48]" />
                            <div className="h-8 w-14 rounded bg-[#233f48]" />
                        </div>
                    ))}
                </div>
                {/* table */}
                <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                    <div className="h-14 bg-[#192d33] border-b border-[#233f48]" />
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-[#233f48]">
                            <div className="size-10 rounded-full bg-[#233f48] shrink-0" />
                            <div className="flex flex-col gap-2 flex-1">
                                <div className="h-3 w-32 rounded bg-[#233f48]" />
                                <div className="h-2 w-48 rounded bg-[#233f48]" />
                            </div>
                            <div className="h-6 w-16 rounded-full bg-[#233f48]" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

interface Props {
    restaurantId: string;
    userRole: 'owner' | 'manager' | 'staff';
}

export function EquipeClient({ restaurantId, userRole }: Props) {
    const router = useRouter();
    const queryClient = useQueryClient();

    // Filters and Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Modal "Novo Colaborador"
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [newCollabLoading, setNewCollabLoading] = useState(false);
    const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
    const [selectedShift, setSelectedShift] = useState('');

    // Modal de Edição (unificado)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<{
        id: string;
        user_id: string;
        name: string;
        email: string;
        avatar?: string;
        role: string;
        active: boolean;
    } | null>(null);

    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    const { data: equipeData, isLoading, error } = useEquipe(restaurantId);
    const updateMember = useUpdateEquipeMember(restaurantId);
    const { data: roles = [] } = useRoles(restaurantId);
    const { data: shifts = [] } = useShifts(restaurantId);

    if (isLoading) {
        return <EquipeSkeleton />;
    }

    if (error) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-[#101d22] gap-4">
                <span className="material-symbols-outlined text-red-500 text-6xl">error</span>
                <p className="text-white">Erro ao carregar os dados da equipe.</p>
            </div>
        );
    }

    const { metrics = { total_colaboradores: 0, media_desempenho: 0, turnos_ativos: 0 }, equipe = [] } = equipeData || {};

    const filteredEquipe = equipe.filter(member => {
        const matchSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) || member.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchRole = roleFilter === '' || member.role === roleFilter;
        let matchStatus = true;
        if (statusFilter === 'active') matchStatus = member.active === true;
        if (statusFilter === 'inactive') matchStatus = member.active === false;
        return matchSearch && matchRole && matchStatus;
    });

    const totalPages = Math.ceil(filteredEquipe.length / itemsPerPage) || 1;
    const paginatedEquipe = filteredEquipe.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const openEditModal = (member: typeof equipe[number]) => {
        setSelectedMember({
            id: member.id,
            user_id: member.user_id,
            name: member.name,
            email: member.email,
            avatar: member.avatar ?? undefined,
            role: member.role,
            active: member.active,
        });
        setIsDrawerOpen(true);
    };

    const handleMemberUpdated = (id: string, updates: { name?: string; role?: string; active?: boolean }) => {
        queryClient.setQueryData(['equipe', restaurantId], (old: EquipeData | undefined) => {
            if (!old) return old;
            return {
                ...old,
                equipe: old.equipe.map(m => m.id === id ? { ...m, ...updates } : m)
            };
        });
        setSelectedMember(prev => prev && prev.id === id ? { ...prev, ...updates } : prev);
    };

    const handleDeactivate = async (id: string, name: string) => {
        if (confirm(`Tem certeza que deseja desativar o acesso de ${name}?`)) {
            setLoadingAction(id);
            try {
                await updateMember.mutateAsync({ id, active: false });
            } catch (err: unknown) {
                alert((err as Error).message || 'Erro ao desativar membro');
            } finally {
                setLoadingAction(null);
            }
        }
    };

    const getToken = async () => {
        const { data: { session } } = await createClient().auth.getSession();
        return session?.access_token || '';
    };

    const handleCreateCollab = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        const name = formData.get('name') as string;
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        const role = formData.get('role') as string;

        setNewCollabLoading(true);
        try {
            const token = await getToken();

            const res = await fetch('/api/equipe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name, email, password, role, restaurant_id: restaurantId })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao cadastrar colaborador');
            }

            const { user_id } = await res.json();

            for (const roleId of selectedAreas) {
                await fetch('/api/user-roles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ restaurant_id: restaurantId, user_id, role_id: roleId })
                });
            }

            if (selectedShift) {
                await fetch('/api/user-shifts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ restaurant_id: restaurantId, user_id, shift_id: selectedShift })
                });
            }

            queryClient.invalidateQueries({ queryKey: ['equipe', restaurantId] });
            setIsModalOpen(false);
            setSelectedAreas([]);
            setSelectedShift('');
            form.reset();
            alert(`Colaborador ${name} cadastrado com sucesso!`);

        } catch (err: unknown) {
            alert((err as Error).message || 'Erro ao cadastrar');
        } finally {
            setNewCollabLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background-light dark:bg-background-dark relative">
            <header className="md:hidden flex items-center justify-between p-4 border-b border-[#233f48] bg-[#101d22] sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/20 text-primary rounded-lg size-8 flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm">restaurant</span>
                    </div>
                    <span className="text-white font-bold text-sm">Ordem na Mesa</span>
                </div>
                <button className="text-white">
                    <span className="material-symbols-outlined">menu</span>
                </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
                <div className="max-w-7xl mx-auto flex flex-col gap-8">
                    {/* Page Heading */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-white text-3xl md:text-4xl font-black tracking-tight">Gestão de Colaboradores</h2>
                            <p className="text-[#92bbc9] text-base">Gerencie sua equipe, turnos e acompanhe o desempenho individual.</p>
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center justify-center gap-2 bg-primary hover:bg-cyan-400 text-[#111e22] font-bold py-2.5 px-5 rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(19,182,236,0.2)]">
                            <span className="material-symbols-outlined text-[20px]">person_add</span>
                            <span>Novo Colaborador</span>
                        </button>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <p className="text-[#92bbc9] font-medium text-sm">Total de Colaboradores</p>
                                <span className="material-symbols-outlined text-primary">groups</span>
                            </div>
                            <h3 className="text-white text-3xl font-bold leading-none">{metrics.total_colaboradores}</h3>
                        </div>
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <p className="text-[#92bbc9] font-medium text-sm">Turnos Ativos Estimados</p>
                                <span className="material-symbols-outlined text-primary">schedule</span>
                            </div>
                            <div className="flex items-end gap-3">
                                <h3 className="text-white text-3xl font-bold leading-none">{metrics.turnos_ativos}</h3>
                                <span className="text-[#92bbc9] text-sm font-medium mb-1">Agora</span>
                            </div>
                        </div>
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <p className="text-[#92bbc9] font-medium text-sm">Média de Desempenho Global</p>
                                <span className="material-symbols-outlined text-primary">monitoring</span>
                            </div>
                            <div className="flex items-end gap-3">
                                <h3 className="text-white text-3xl font-bold leading-none">{metrics.media_desempenho}%</h3>
                                <span className="text-emerald-400 text-sm font-medium mb-1">7 dias</span>
                            </div>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-col md:flex-row gap-4 bg-[#1a2c32] p-4 rounded-xl border border-[#233f48] items-center justify-between">
                        <div className="relative w-full md:max-w-md">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="material-symbols-outlined text-[#92bbc9]">search</span>
                            </div>
                            <input
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                className="bg-[#101d22] text-white border border-[#233f48] rounded-lg pl-10 pr-4 py-2.5 w-full focus:ring-1 focus:ring-primary focus:border-primary placeholder-[#92bbc9]/50 text-sm"
                                placeholder="Buscar por nome ou email..."
                                type="text"
                            />
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }} className="bg-[#101d22] text-white border border-[#233f48] rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary min-w-[140px]">
                                <option value="">Todos Cargos</option>
                                <option value="staff">Colaborador</option>
                                <option value="manager">Gerente</option>
                                <option value="owner">Proprietário</option>
                            </select>
                            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="bg-[#101d22] text-white border border-[#233f48] rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary min-w-[140px]">
                                <option value="">Todos Status</option>
                                <option value="active">Ativo</option>
                                <option value="inactive">Inativo</option>
                            </select>
                        </div>
                    </div>

                    {/* Tabela */}
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-[#152328] border-b border-[#233f48]">
                                        <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase tracking-wider">Colaborador</th>
                                        <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase tracking-wider">Cargo</th>
                                        <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase tracking-wider">Status</th>
                                        <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase tracking-wider w-48">Desempenho</th>
                                        <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase tracking-wider text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#233f48]">
                                    {paginatedEquipe.length === 0 ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-[#92bbc9]">Nenhum colaborador encontrado.</td></tr>
                                    ) : paginatedEquipe.map((member) => (
                                        <tr
                                            key={member.id}
                                            className="group hover:bg-[#233f48]/50 cursor-pointer transition-colors"
                                            onClick={() => openEditModal(member)}
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar
                                                        src={member.avatar}
                                                        name={member.name}
                                                        size={40}
                                                        border="border-[#233f48]"
                                                    />
                                                    <div className="flex flex-col max-w-[200px]">
                                                        <p className="font-medium text-white text-sm truncate">{member.name}</p>
                                                        <p className="text-[#92bbc9] text-xs truncate">{member.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {member.role === 'staff' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Colaborador</span>}
                                                {member.role === 'manager' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">Gerente</span>}
                                                {member.role === 'owner' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">Proprietário</span>}
                                            </td>
                                            <td className="p-4">
                                                {member.active ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="relative flex h-2.5 w-2.5">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0bda57] opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0bda57]"></span>
                                                        </span>
                                                        <span className="text-sm text-white">Ativo</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-500"></span>
                                                        <span className="text-sm text-gray-400">Inativo</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3 w-40">
                                                    <div className="flex-1 h-2 bg-[#101d22] rounded-full overflow-hidden">
                                                        {member.performance !== null && (
                                                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${member.performance}%` }}></div>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-medium text-white w-8">
                                                        {member.performance !== null ? `${member.performance}%` : '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); router.push(`/historico?user_id=${member.user_id}`); }} className="p-1.5 text-[#92bbc9] hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Ver Histórico">
                                                        <span className="material-symbols-outlined text-[20px]">history</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); openEditModal(member); }} className="p-1.5 text-[#92bbc9] hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Editar">
                                                        <span className="material-symbols-outlined text-[20px]">edit</span>
                                                    </button>
                                                    {member.active && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeactivate(member.id, member.name); }} disabled={loadingAction === member.id} className="p-1.5 text-[#92bbc9] hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors disabled:opacity-50" title="Desativar Acesso">
                                                            <span className="material-symbols-outlined text-[20px]">{loadingAction === member.id ? 'hourglass_empty' : 'block'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginação */}
                        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-[#233f48] gap-4">
                            <p className="text-sm text-[#92bbc9]">
                                Mostrando <span className="font-medium text-white">{paginatedEquipe.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> a <span className="font-medium text-white">{Math.min(currentPage * itemsPerPage, filteredEquipe.length)}</span> de <span className="font-medium text-white">{filteredEquipe.length}</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="flex items-center justify-center h-8 w-8 rounded-lg border border-[#233f48] text-[#92bbc9] hover:text-white hover:bg-[#233f48] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                </button>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="flex items-center justify-center h-8 w-8 rounded-lg border border-[#233f48] text-[#92bbc9] hover:text-white hover:bg-[#233f48] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal Novo Colaborador */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center p-5 border-b border-[#233f48] shrink-0">
                            <h3 className="text-white text-xl font-bold">Novo Colaborador</h3>
                            <button onClick={() => { setIsModalOpen(false); setSelectedAreas([]); setSelectedShift(''); }} className="text-[#92bbc9] hover:text-white transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            <form id="newCollabForm" onSubmit={handleCreateCollab} className="p-5 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">Nome completo *</label>
                                    <input required name="name" type="text" placeholder="Ex: João Silva" className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm" />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">E-mail *</label>
                                    <input required name="email" type="email" placeholder="colaborador@restaurante.com" className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm" />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">Senha temporária * (mín. 6 caracteres)</label>
                                    <div className="relative">
                                        <input required name="password" type={showPassword ? 'text' : 'password'} minLength={6} placeholder="••••••" className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 pr-10 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm" />
                                        <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#92bbc9] hover:text-white">
                                            <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">Cargo *</label>
                                    <select name="role" defaultValue="staff" className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm cursor-pointer">
                                        <option value="staff">Colaborador (Staff)</option>
                                        <option value="manager">Gerente</option>
                                        <option value="owner">Administrador</option>
                                    </select>
                                </div>

                                {roles.filter(r => r.active).length > 0 && (
                                    <div>
                                        <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">Áreas (opcional)</label>
                                        <div className="flex flex-wrap gap-2">
                                            {roles.filter(r => r.active).map(r => (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => setSelectedAreas(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id])}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${selectedAreas.includes(r.id) ? 'border-primary bg-primary/10 text-primary' : 'border-[#325a67] text-[#92bbc9] hover:border-primary/50'}`}
                                                >
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                                                    {r.name}
                                                    {selectedAreas.includes(r.id) && <span className="material-symbols-outlined text-[14px]">check</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {shifts.filter(s => s.active).length > 0 && (
                                    <div>
                                        <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">Turno (opcional)</label>
                                        <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm cursor-pointer">
                                            <option value="">Sem turno definido</option>
                                            {shifts.filter(s => s.active).map(s => (
                                                <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </form>
                        </div>

                        <div className="p-5 border-t border-[#233f48] shrink-0">
                            <button type="submit" form="newCollabForm" disabled={newCollabLoading} className="w-full bg-primary hover:bg-cyan-400 text-black font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50">
                                {newCollabLoading ? 'Cadastrando...' : 'Cadastrar Colaborador'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Edição Unificado */}
            <TeamDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                member={selectedMember}
                onUpdated={handleMemberUpdated}
            />
        </div>
    );
}
