"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { usePurchaseLists, useCreatePurchaseList } from "@/lib/hooks/use-purchases";
import { useRoles } from "@/lib/hooks/use-roles";
import { UnitBadge } from "@/components/ui/unit-badge";
import type { Scope } from "@/lib/types/scope";

export default function ComprasPage() {
    const router = useRouter();
    const { restaurantId, userRole } = useRestaurantStore();
    const accountMode = useAccountSessionStore((s) => s.mode);
    const accountId = useAccountSessionStore((s) => s.accountId);
    const isGlobal = accountMode === 'global';

    const scope: Scope | undefined = useMemo(() => {
        if (isGlobal && accountId) return { mode: 'global', accountId };
        if (restaurantId) return { mode: 'single', restaurantId };
        return undefined;
    }, [isGlobal, accountId, restaurantId]);

    const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Hooks
    const { data: lists = [], isLoading } = usePurchaseLists(scope, activeTab);
    const { data: roles = [] } = useRoles(restaurantId || undefined);
    const createList = useCreatePurchaseList();

    // Form
    const [formTitle, setFormTitle] = useState("");
    const [formTargetRoles, setFormTargetRoles] = useState<string[]>([]);

    if (!isGlobal && (!restaurantId || userRole === 'staff')) {
        return <div className="p-8 text-white">Carregando permissões...</div>;
    }

    const availableRoles = roles.filter(r => r.active);

    const toggleTargetRole = (roleId: string) => {
        setFormTargetRoles(prev =>
            prev.includes(roleId)
                ? prev.filter(id => id !== roleId)
                : [...prev, roleId]
        );
    };

    const handleCreateList = async () => {
        if (!restaurantId || !formTitle || isGlobal) return;
        try {
            const newList = await createList.mutateAsync({
                restaurant_id: restaurantId,
                title: formTitle,
                status: 'open',
                target_role_ids: formTargetRoles
            });
            setIsModalOpen(false);
            if (newList && newList.id) {
                router.push(`/compras/${newList.id}`);
            }
        } catch (error) {
            console.error("Erro ao criar lista", error);
            alert("Erro ao criar lista de compras.");
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <div className="bg-[#16262c] border-b border-[#233f48] px-6 py-6 lg:py-8 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1 font-fraunces">Compras e Recebimento</h1>
                        <p className="text-sm text-[#92bbc9]">
                            Gerencie as listas de compras e acompanhe o recebimento de mercadorias.
                        </p>
                    </div>
                    {!isGlobal && (
                        <button
                            onClick={() => {
                                setFormTitle("");
                                setFormTargetRoles([]);
                                setIsModalOpen(true);
                            }}
                            className="flex items-center justify-center gap-2 bg-[#13b6ec] text-[#101d22] px-4 py-2.5 rounded-lg font-semibold hover:bg-white hover:text-[#101d22] transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-xl">add_shopping_cart</span>
                            Nova Lista
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-[#233f48] mt-2">
                    <button
                        onClick={() => setActiveTab('open')}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "open" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                    >
                        Em Aberto
                    </button>
                    <button
                        onClick={() => setActiveTab('closed')}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "closed" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                    >
                        Recebidas / Fechadas
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#13b6ec]"></div>
                    </div>
                ) : lists.length === 0 ? (
                    <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
                        <div className="w-16 h-16 rounded-full bg-[#1a2c32] flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-[#325a67] text-3xl">shopping_cart</span>
                        </div>
                        <h3 className="text-white font-medium mb-1">Nenhuma lista encontrada</h3>
                        <p className="text-sm text-[#92bbc9]">Crie uma nova lista para começar.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {lists.map((list) => {
                            // Safely extract items count (if the API supports returning it)
                            const itemsObj = (list as { items?: { checked?: boolean }[] }).items || [];
                            const totalItems = itemsObj.length || 0;
                            const checkedItems = itemsObj.filter((i) => i.checked).length || 0;
                            // Progress calculation logic safely guarded
                            const progress = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;

                            return (
                                <div
                                    key={list.id}
                                    onClick={() => router.push(`/compras/${list.id}`)}
                                    className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 hover:border-[#325a67] hover:bg-[#1f353d] transition-colors cursor-pointer flex flex-col group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex flex-col gap-1">
                                            <h3 className="text-white font-bold text-lg">{list.title}</h3>
                                            {(list as { unit?: { name: string } }).unit && (
                                                <UnitBadge name={(list as { unit: { name: string } }).unit.name} />
                                            )}
                                        </div>
                                        {list.status === 'open' ? (
                                            <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] uppercase font-bold px-2 py-1 rounded-md">Aberta</span>
                                        ) : (
                                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-bold px-2 py-1 rounded-md">Fechada</span>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1 mb-4">
                                        <span className="text-[#92bbc9] text-xs">
                                            Criada em {new Date(list.created_at).toLocaleDateString('pt-BR')}
                                        </span>
                                        {list.closed_at && (
                                            <span className="text-[#92bbc9] text-xs">
                                                Fechada em {new Date(list.closed_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-[#233f48]">
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs text-[#92bbc9] font-medium">Progresso de recebimento</span>
                                            <span className="text-sm font-bold text-white">{checkedItems} / {totalItems}</span>
                                        </div>
                                        <div className="w-full bg-[#101d22] rounded-full h-1.5 overflow-hidden">
                                            <div className="bg-[#13b6ec] h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal Nova Lista */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#16262c] rounded-2xl w-full max-w-md border border-[#233f48] shadow-2xl overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-[#233f48] flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Nova Lista de Compras</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-[#92bbc9] hover:text-white transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[#92bbc9]">Título da Lista</label>
                                <input
                                    type="text"
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    placeholder="Ex: Hortifruti Segunda, Compra Ceagesp, etc."
                                    className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors"
                                    autoFocus
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-[#92bbc9]">Direcionar checklist de recebimento para (Opcional):</label>
                                <div className="flex flex-wrap gap-2">
                                    {availableRoles.length === 0 && <span className="text-xs text-[#325a67]">Nenhuma função cadastrada</span>}
                                    {availableRoles.map(r => {
                                        const selected = formTargetRoles.includes(r.id);
                                        return (
                                            <button
                                                key={r.id}
                                                onClick={() => toggleTargetRole(r.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${selected
                                                    ? 'bg-opacity-20 '
                                                    : 'bg-[#1a2c32] border-[#233f48] text-[#92bbc9] hover:border-[#325a67] hover:text-white'
                                                    }`}
                                                style={selected ? { backgroundColor: `${r.color}20`, borderColor: r.color, color: r.color } : undefined}
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                                                {r.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                <span className="text-[10px] text-[#325a67]">Se selecionado, o APP mobile vai exibir este card para a equipe destas áreas preencher na chegada de insumos.</span>
                            </div>
                        </div>

                        <div className="p-6 border-t border-[#233f48] flex gap-3 shrink-0 bg-[#111e22]">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-lg font-medium text-[#92bbc9] hover:text-white hover:bg-[#1a2c32] transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateList}
                                disabled={!formTitle || createList.isPending}
                                className="flex-1 bg-[#13b6ec] text-[#101d22] px-4 py-3 rounded-lg font-bold hover:bg-white transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {createList.isPending ? (
                                    <div className="w-5 h-5 border-2 border-[#101d22] border-t-transparent rounded-full animate-spin" />
                                ) : "Criar Lista"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
