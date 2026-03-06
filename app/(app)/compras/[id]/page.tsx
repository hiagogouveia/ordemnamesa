"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { usePurchaseListDetails, useUpdatePurchaseList, useCreatePurchaseItem, useUpdatePurchaseItem } from "@/lib/hooks/use-purchases";
import { useRoles } from "@/lib/hooks/use-roles";
import { PurchaseItem } from "@/lib/types";

const UNITS = ["un", "kg", "g", "L", "ml", "cx", "pct"];

export default function ComprasDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const listId = params.id as string;

    // We safely use 'manager' or 'owner' or check 'can_launch_purchases'
    const { restaurantId, userRole } = useRestaurantStore();

    // Hooks
    const { data: details, isLoading } = usePurchaseListDetails(restaurantId || undefined, listId);
    const { data: roles = [] } = useRoles(restaurantId || undefined);
    const updateList = useUpdatePurchaseList();
    const addItem = useCreatePurchaseItem();
    const updateItem = useUpdatePurchaseItem();

    const [formName, setFormName] = useState("");
    const [formQtd, setFormQtd] = useState("");
    const [formUnit, setFormUnit] = useState("un");
    const [formBrand, setFormBrand] = useState("");
    const [formNotes, setFormNotes] = useState("");

    const [flaggingItem, setFlaggingItem] = useState<PurchaseItem | null>(null);
    const [problemNotes, setProblemNotes] = useState("");

    if (!restaurantId || userRole === 'staff') {
        return <div className="p-8 text-white">Acesso restrito</div>;
    }

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center bg-[#101d22]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#13b6ec]"></div>
            </div>
        );
    }

    if (!details?.list) {
        return (
            <div className="flex flex-col h-full bg-[#101d22] items-center justify-center gap-4">
                <span className="material-symbols-outlined text-4xl text-[#92bbc9]">search_off</span>
                <p className="text-white text-lg font-bold">Lista não encontrada</p>
                <button onClick={() => router.push('/compras')} className="text-[#13b6ec] hover:underline">Voltar para compras</button>
            </div>
        );
    }

    const { list, items } = details;
    const isClosed = list.status === 'closed';

    const targetRoles = list.target_role_ids?.map((id: string) => roles.find((r) => r.id === id)).filter(Boolean) || [];

    const checkedItems = items.filter(i => i.checked);
    const totalItems = items.length;
    const progress = totalItems > 0 ? (checkedItems.length / totalItems) * 100 : 0;

    const handleCloseList = async () => {
        if (!confirm("Tem certeza que deseja fechar esta lista? Ela não poderá mais ser editada.")) return;
        try {
            await updateList.mutateAsync({ restaurant_id: restaurantId, id: list.id, status: 'closed' });
        } catch (error) {
            console.error(error);
        }
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName || !formQtd) return;
        try {
            await addItem.mutateAsync({
                restaurant_id: restaurantId,
                purchase_list_id: list.id,
                name: formName,
                quantity: parseFloat(formQtd),
                unit: formUnit,
                brand: formBrand,
                notes: formNotes,
                checked: false,
                has_problem: false
            });
            // Reset
            setFormName(""); setFormQtd(""); setFormBrand(""); setFormNotes(""); setFormUnit("un");
        } catch (error) {
            console.error(error);
        }
    };

    const toggleItemCheck = async (item: PurchaseItem) => {
        if (isClosed) return;
        try {
            await updateItem.mutateAsync({
                restaurant_id: restaurantId,
                purchase_list_id: list.id,
                id: item.id,
                checked: !item.checked,
                // we dont toggle has_problem here, just checked
            });
        } catch (error) {
            console.error(error);
        }
    };

    const handleFlagProblem = async () => {
        if (!flaggingItem) return;
        try {
            await updateItem.mutateAsync({
                restaurant_id: restaurantId,
                purchase_list_id: list.id,
                id: flaggingItem.id,
                has_problem: true,
                problem_notes: problemNotes,
                checked: true // usually flagged means it was checked but has a problem
            });
            setFlaggingItem(null);
            setProblemNotes("");
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <header className="bg-[#16262c] border-b border-[#233f48] px-6 py-4 lg:py-6 flex flex-col gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-3 text-[#92bbc9] text-sm font-medium">
                    <button onClick={() => router.push('/compras')} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        Voltar
                    </button>
                    <span>/</span>
                    <span>Lista de Compras</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-white truncate font-fraunces">{list.title}</h1>
                            {isClosed ? (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-bold px-2 py-1 rounded-md shrink-0">Fechada</span>
                            ) : (
                                <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] uppercase font-bold px-2 py-1 rounded-md shrink-0">Aberta</span>
                            )}
                        </div>
                        {targetRoles.length > 0 && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs text-[#325a67]">Recebimento por:</span>
                                {targetRoles.map(r => r && (
                                    <span key={r.id} className="text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 opacity-80" style={{ borderColor: r.color, color: r.color, backgroundColor: `${r.color}15` }}>
                                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                                        {r.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    {!isClosed && (userRole === 'owner' || userRole === 'manager') && (
                        <button
                            onClick={handleCloseList}
                            className="flex items-center justify-center gap-2 bg-[#1a2c32] text-white border border-red-500/40 px-4 py-2 rounded-lg font-semibold hover:bg-red-500/10 hover:border-red-500 transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-xl text-red-400">lock</span>
                            Fechar Lista
                        </button>
                    )}
                </div>

                {/* Progressive Bar */}
                <div className="flex flex-col gap-1.5 w-full max-w-xl mx-auto sm:mx-0 mt-2">
                    <div className="flex justify-between items-end">
                        <span className="text-xs text-[#92bbc9] font-medium uppercase tracking-wider">Conferidos</span>
                        <span className="text-sm font-bold text-white tracking-widest">{checkedItems.length} / {totalItems}</span>
                    </div>
                    <div className="w-full bg-[#101d22] rounded-full h-2 overflow-hidden border border-[#233f48]">
                        <div className={`h-2 rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-400' : 'bg-[#13b6ec]'}`} style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6 lg:px-8 max-w-4xl mx-auto w-full flex flex-col gap-6">

                {/* Form Adicionar Item */}
                {!isClosed && (
                    <form onSubmit={handleAddItem} className="bg-[#1a2c32] rounded-xl border border-[#233f48] p-4 flex flex-col md:flex-row gap-3 shadow-md focus-within:border-[#325a67] transition-colors">
                        <div className="grid grid-cols-2 md:flex md:flex-1 gap-3">
                            <input
                                type="text"
                                required
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="Nome do item *"
                                className="col-span-2 md:w-1/3 min-w-0 bg-[#101d22] text-white rounded-lg px-3 py-2 border border-[#233f48] focus:border-[#13b6ec] outline-none text-sm placeholder:text-[#325a67]"
                            />
                            <div className="flex gap-2 min-w-0">
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={formQtd}
                                    onChange={(e) => setFormQtd(e.target.value)}
                                    placeholder="Qtd *"
                                    className="w-full bg-[#101d22] text-white rounded-lg px-3 py-2 border border-[#233f48] focus:border-[#13b6ec] outline-none text-sm placeholder:text-[#325a67]"
                                />
                                <span className="text-[#325a67] py-2">|</span>
                                <select
                                    value={formUnit}
                                    onChange={(e) => setFormUnit(e.target.value)}
                                    className="w-full bg-[#101d22] text-white rounded-lg px-2 py-2 border border-[#233f48] focus:border-[#13b6ec] outline-none text-sm cursor-pointer"
                                >
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <input
                                type="text"
                                value={formBrand}
                                onChange={(e) => setFormBrand(e.target.value)}
                                placeholder="Marca (opc)"
                                className="min-w-0 bg-[#101d22] text-white rounded-lg px-3 py-2 border border-[#233f48] focus:border-[#13b6ec] outline-none text-sm placeholder:text-[#325a67]"
                            />
                            <input
                                type="text"
                                value={formNotes}
                                onChange={(e) => setFormNotes(e.target.value)}
                                placeholder="Notas (opc)"
                                className="col-span-2 min-w-0 md:flex-1 bg-[#101d22] text-white rounded-lg px-3 py-2 border border-[#233f48] focus:border-[#13b6ec] outline-none text-sm placeholder:text-[#325a67]"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!formName || !formQtd || addItem.isPending}
                            className="bg-[#13b6ec] hover:bg-white text-[#101d22] font-bold rounded-lg px-4 py-2 shrink-0 transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                            {addItem.isPending ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span>ADC</span>}
                        </button>
                    </form>
                )}

                {/* Lista de Itens */}
                <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                    {items.length === 0 ? (
                        <div className="p-12 text-center text-[#325a67] text-sm">Nenhum item adicionado nesta lista.</div>
                    ) : (
                        <ul className="divide-y divide-[#233f48]">
                            {items.map((item) => (
                                <li key={item.id} className={`p-4 flex flex-col sm:flex-row gap-4 sm:items-center justify-between transition-colors ${item.checked ? 'bg-[#101d22]/50 opacity-80' : 'hover:bg-[#1f353d]'}`}>
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <button
                                            onClick={() => toggleItemCheck(item)}
                                            disabled={isClosed}
                                            className={`w-6 h-6 shrink-0 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all ${item.checked
                                                ? 'bg-emerald-500 border-emerald-500 text-[#101d22]'
                                                : 'border-[#325a67] text-transparent hover:border-[#13b6ec]'
                                                }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px] font-bold">check</span>
                                        </button>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`font-bold text-base ${item.checked && !item.has_problem ? 'line-through text-[#92bbc9]' : 'text-white'}`}>
                                                    {item.quantity} {item.unit} — {item.name}
                                                </span>
                                                {item.brand && (
                                                    <span className="text-[10px] uppercase font-bold text-[#13b6ec] bg-[#13b6ec]/10 px-1.5 py-0.5 rounded border border-[#13b6ec]/20 shrink-0">
                                                        {item.brand}
                                                    </span>
                                                )}
                                                {item.has_problem && (
                                                    <span className="text-[10px] uppercase font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20 shrink-0 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[12px]">warning</span> Problema
                                                    </span>
                                                )}
                                            </div>
                                            {item.notes && (
                                                <span className="text-xs text-[#92bbc9] italic mt-1 bg-[#101d22] p-1.5 rounded-md border border-[#233f48] w-fit max-w-full truncate">
                                                    OBS: {item.notes}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 sm:ml-4 shrink-0 mt-2 sm:mt-0">
                                        {!isClosed && !item.has_problem && (
                                            <button
                                                onClick={() => setFlaggingItem(item)}
                                                className="flex items-center gap-1 text-[11px] font-bold uppercase text-red-400 px-2 py-1.5 rounded-md bg-[#16262c] border border-red-500/10 hover:border-red-500/40 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">warning</span>
                                                Faltou/Avaria
                                            </button>
                                        )}
                                        {item.has_problem && item.problem_notes && (
                                            <div className="text-xs text-red-400 bg-red-500/10 px-2.5 py-1.5 rounded-lg border border-red-500/20 max-w-[200px] truncate" title={item.problem_notes}>
                                                Motivo: {item.problem_notes}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Modal for Flagging Problem */}
            {flaggingItem && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#16262c] rounded-2xl w-full max-w-sm border border-[#233f48] shadow-2xl overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-[#233f48] flex justify-between items-center bg-red-500/10">
                            <h2 className="text-lg font-bold text-red-500 flex items-center gap-2">
                                <span className="material-symbols-outlined text-xl">warning</span>
                                Reportar Problema
                            </h2>
                            <button onClick={() => setFlaggingItem(null)} className="text-[#92bbc9] hover:text-white transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-5 flex flex-col gap-4">
                            <p className="text-sm text-white font-medium">
                                Qual foi o problema na conferência de <strong className="text-primary">{flaggingItem.name}</strong>?
                            </p>
                            <textarea
                                autoFocus
                                value={problemNotes}
                                onChange={(e) => setProblemNotes(e.target.value)}
                                placeholder="Ex: Faltou 2 caixas, caixa chegou amassada..."
                                rows={3}
                                className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 transition-colors text-sm resize-none"
                            ></textarea>
                            <span className="text-[10px] text-[#92bbc9]">Ao sinalizar problema, o item será marcado como conferido para prosseguir.</span>
                        </div>
                        <div className="p-5 border-t border-[#233f48] flex gap-3 shrink-0 bg-[#111e22]">
                            <button onClick={() => setFlaggingItem(null)} className="flex-1 px-3 py-2 rounded-lg font-medium text-[#92bbc9] hover:text-white hover:bg-[#1a2c32] transition-colors text-sm">
                                Cancelar
                            </button>
                            <button
                                onClick={handleFlagProblem}
                                disabled={!problemNotes || updateItem.isPending}
                                className="flex-1 bg-red-500 text-white px-3 py-2 rounded-lg font-bold hover:bg-red-400 transition-colors disabled:opacity-50 text-sm flex justify-center items-center"
                            >
                                {updateItem.isPending ? <span className="material-symbols-outlined animate-spin text-[18px]">refresh</span> : "Salvar Problema"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
