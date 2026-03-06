'use client';

import React, { useState, useEffect } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { usePurchaseListDetails, useUpdatePurchaseItem, useUpdatePurchaseList } from '@/lib/hooks/use-purchases';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function RecebimentoPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { restaurantId } = useRestaurantStore();

    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            if (data.user) setUserId(data.user.id);
        });
    }, []);

    const { data, isLoading } = usePurchaseListDetails(restaurantId || undefined, params.id);
    const updateItem = useUpdatePurchaseItem();
    const updateList = useUpdatePurchaseList();

    const list = data?.list;
    const items = data?.items || [];

    const progress = items.length > 0 ? Math.round((items.filter(i => i.checked || i.has_problem).length / items.length) * 100) : 0;
    const isCompleted = items.length > 0 && items.every(i => i.checked || i.has_problem);

    const [problemModal, setProblemModal] = useState<any>(null);
    const [problemText, setProblemText] = useState('');

    const handleToggleCheck = async (item: any) => {
        if (!restaurantId || !userId) return;

        // Optimistic UI handled manually or via react-query onSuccess
        const isNowChecked = !item.checked;

        try {
            await updateItem.mutateAsync({
                id: item.id,
                restaurant_id: restaurantId,
                purchase_list_id: params.id,
                checked: isNowChecked,
                checked_by: isNowChecked ? userId : undefined,
                checked_at: isNowChecked ? new Date().toISOString() : undefined,
                has_problem: isNowChecked ? item.has_problem : false,
                problem_notes: isNowChecked ? item.problem_notes : undefined
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleProblemSubmit = async () => {
        if (!restaurantId || !userId || !problemModal) return;

        try {
            await updateItem.mutateAsync({
                id: problemModal.id,
                restaurant_id: restaurantId,
                purchase_list_id: params.id,
                checked: true,
                checked_by: userId,
                checked_at: new Date().toISOString(),
                has_problem: true,
                problem_notes: problemText
            });
            setProblemModal(null);
            setProblemText('');
        } catch (e) {
            console.error(e);
        }
    };

    const handleRemoverProblema = async (item: any) => {
        if (!restaurantId || !userId) return;
        try {
            await updateItem.mutateAsync({
                id: item.id,
                restaurant_id: restaurantId,
                purchase_list_id: params.id,
                has_problem: false,
                problem_notes: undefined
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleConcluirConferencia = async () => {
        // Here we could also update the list status to closed, or just leave it for managers and simply return.
        // The prompt says: "Botão Finalizar Conferência -> toast + redirect /turno"
        alert('Conferência registrada com sucesso!');
        router.push('/turno');
    };

    if (isLoading) {
        return <div className="min-h-screen bg-[#101d22] flex items-center justify-center p-4">
            <div className="size-10 border-4 border-[#13b6ec] border-t-transparent rounded-full animate-spin"></div>
        </div>;
    }

    if (!list) {
        return <div className="min-h-screen bg-[#101d22] flex items-center justify-center p-4">
            <p className="text-white">Lista não encontrada.</p>
        </div>;
    }

    return (
        <div className="min-h-full bg-[#101d22] font-sans pb-32">
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48] px-4 py-4">
                <div className="max-w-[480px] mx-auto w-full flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <Link href="/turno" className="size-8 flex items-center justify-center rounded-full bg-[#1a2c32] text-[#92bbc9] hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-lg">arrow_back</span>
                        </Link>
                        <h1 className="text-white font-bold text-lg leading-tight truncate">Recebimento: <br /><span className="text-[#92bbc9] text-base font-medium">{list.title}</span></h1>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                            <span className="text-white">Progresso</span>
                            <span className="text-[#13b6ec]">{progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-[#1a2c32] rounded-full overflow-hidden">
                            <div className="h-full bg-[#13b6ec] transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-[480px] mx-auto w-full p-4 flex flex-col gap-4">
                {items.length === 0 ? (
                    <div className="text-center py-10 bg-[#1a2c32] rounded-xl border border-dashed border-[#233f48] text-[#92bbc9] text-sm font-medium">
                        Nenhum item nesta lista.
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {items.map(item => (
                            <div key={item.id} className={`bg-[#1a2c32] p-4 rounded-xl flex flex-col gap-3 border transition-colors ${item.has_problem ? 'border-red-500/50 bg-red-950/10' : item.checked ? 'border-[#13b6ec]/30 opacity-70' : 'border-[#233f48]'}`}>
                                <div className="flex justify-between items-start gap-3">
                                    <div
                                        onClick={() => handleToggleCheck(item)}
                                        className={`size-6 rounded flex items-center justify-center shrink-0 mt-0.5 cursor-pointer transition-colors ${item.checked ? 'bg-[#13b6ec] border-[#13b6ec]' : 'border-2 border-[#92bbc9] hover:border-[#13b6ec]'}`}
                                    >
                                        {item.checked && <span className="material-symbols-outlined text-[16px] text-[#111e22] font-bold">check</span>}
                                    </div>

                                    <div className="flex-1 flex flex-col min-w-0" onClick={() => handleToggleCheck(item)}>
                                        <span className={`text-white font-medium break-words ${item.checked && !item.has_problem ? 'line-through text-[#92bbc9]' : ''}`}>{item.name}</span>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-[#92bbc9]">
                                            <span className="bg-[#233f48] px-1.5 py-0.5 rounded text-white font-bold">{item.quantity} {item.unit}</span>
                                            {item.brand && <span>Marca: {item.brand}</span>}
                                        </div>
                                    </div>
                                </div>

                                {item.has_problem ? (
                                    <div className="flex flex-col gap-2 mt-1 ml-9">
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-red-400 text-xs flex flex-col gap-1">
                                            <div className="font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">warning</span> Problema Reportado:</div>
                                            <p className="italic">"{item.problem_notes}"</p>
                                        </div>
                                        <button onClick={() => handleRemoverProblema(item)} className="text-xs text-[#92bbc9] hover:text-white self-start underline underline-offset-2">Desfazer problema</button>
                                    </div>
                                ) : (
                                    <div className="flex justify-end mt-1">
                                        <button
                                            onClick={() => setProblemModal(item)}
                                            className="text-xs text-red-400 font-medium px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">flag</span>
                                            Reportar Problema
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <div className="fixed bottom-0 left-0 w-full p-4 bg-[#101d22]/95 backdrop-blur border-t border-[#233f48] z-30 flex justify-center">
                <div className="max-w-[480px] w-full">
                    <button
                        disabled={!isCompleted || items.length === 0}
                        onClick={handleConcluirConferencia}
                        className="w-full py-4 rounded-xl bg-[#13b6ec] hover:bg-[#10a1d4] disabled:bg-[#233f48] disabled:text-[#92bbc9] text-[#111e22] font-bold text-base transition-colors shadow-lg shadow-[#13b6ec]/20 disabled:shadow-none flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">verified</span>
                        Finalizar Conferência
                    </button>
                </div>
            </div>

            {/* Problem Modal */}
            {problemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-5 w-full max-w-[360px] flex flex-col gap-4 shadow-xl">
                        <div className="flex items-center gap-2 text-red-400">
                            <span className="material-symbols-outlined text-2xl">warning</span>
                            <h3 className="font-bold text-lg truncate">Problema no Item</h3>
                        </div>
                        <p className="text-[#92bbc9] text-xs">Descreva o problema com <strong className="text-white">"{problemModal.name}"</strong> (avaria, item faltando, marca errada, etc.)</p>

                        <textarea
                            autoFocus
                            value={problemText}
                            onChange={(e) => setProblemText(e.target.value)}
                            className="bg-[#101d22] border border-[#233f48] rounded-xl p-3 text-white text-sm focus:border-red-400 focus:outline-none min-h-[100px] resize-none"
                            placeholder="Ex: Chegou apenas 5 unidades. / A caixa veio amassada."
                        />

                        <div className="flex gap-3 mt-2">
                            <button onClick={() => { setProblemModal(null); setProblemText(''); }} className="flex-1 py-2.5 rounded-xl bg-[#233f48] text-white font-medium text-sm">Cancelar</button>
                            <button
                                onClick={handleProblemSubmit}
                                disabled={!problemText.trim()}
                                className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-500 border border-red-500/30 font-bold disabled:opacity-50 text-sm uppercase tracking-wide">
                                Reportar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
