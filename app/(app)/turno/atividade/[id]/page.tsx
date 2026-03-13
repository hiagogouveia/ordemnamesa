'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useActivityData } from '@/lib/hooks/use-activity-execution';
import { useChecklistAssumption, useAssumeChecklist } from '@/lib/hooks/use-tasks';
import { createClient } from '@/lib/supabase/client';

function getTimeWindowStatus(
    startTime: string | undefined,
    endTime: string | undefined,
    currentTime: string
): 'always' | 'before' | 'active' | 'after' {
    if (!startTime && !endTime) return 'always';
    if (startTime && currentTime < startTime) return 'before';
    if (endTime && currentTime > endTime) return 'after';
    return 'active';
}

export default function ActivityDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const checklistId = params.id as string;
    const { restaurantId } = useRestaurantStore();

    const [currentTime, setCurrentTime] = useState('');
    const [user, setUser] = useState<{ id: string; name: string } | null>(null);
    const [assuming, setAssuming] = useState(false);

    useEffect(() => {
        setCurrentTime(new Date().toTimeString().slice(0, 5));
        const interval = setInterval(() => setCurrentTime(new Date().toTimeString().slice(0, 5)), 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            if (data.user) {
                setUser({
                    id: data.user.id,
                    name: data.user.user_metadata?.name || data.user.email || 'Funcionário'
                });
            }
        });
    }, []);

    const { data: activityData, isLoading, isError } = useActivityData(restaurantId || undefined, checklistId);
    const { data: assumption } = useChecklistAssumption(restaurantId || undefined, checklistId);
    const assumeMutation = useAssumeChecklist();

    const { checklist, tasks } = activityData || {};

    const timeWindowStatus = getTimeWindowStatus(
        checklist?.start_time as string | undefined,
        checklist?.end_time as string | undefined,
        currentTime
    );

    const handleAssume = async () => {
        if (!restaurantId || !checklistId) return;
        setAssuming(true);
        try {
            await assumeMutation.mutateAsync({ restaurantId, checklistId });
            router.push(`/turno/atividade/${checklistId}/executar`);
        } catch (e) {
            console.error('Erro ao assumir atividade:', e);
            setAssuming(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#101d22] flex flex-col pt-4 p-4 animate-pulse">
                <div className="h-12 w-full max-w-[480px] mx-auto bg-[#1a2c32] rounded-xl mb-4"></div>
                <div className="h-40 w-full max-w-[480px] mx-auto bg-[#1a2c32] rounded-2xl mb-4"></div>
                <div className="h-20 w-full max-w-[480px] mx-auto bg-[#1a2c32] rounded-xl"></div>
            </div>
        );
    }

    if (isError || !checklist || !tasks) {
        return (
            <div className="min-h-screen bg-[#101d22] flex flex-col items-center justify-center p-6 text-center">
                <span className="material-symbols-outlined text-red-500 text-5xl mb-4">error</span>
                <h2 className="text-white text-xl font-bold mb-2">Atividade não encontrada</h2>
                <p className="text-[#92bbc9] mb-8">Não foi possível carregar os detalhes desta atividade.</p>
                <button
                    onClick={() => router.push('/turno')}
                    className="bg-[#233f48] text-white px-6 py-3 rounded-xl font-bold active:scale-95 transition-transform"
                >
                    Voltar ao Turno
                </button>
            </div>
        );
    }

    const isAssumedByMe = assumption?.user_id === user?.id;
    const isAssumedByOther = !!assumption && !isAssumedByMe;

    // Shift type labels
    const shiftLabels: Record<string, string> = {
        morning: 'Manhã',
        afternoon: 'Tarde',
        evening: 'Noite',
        any: 'Qualquer turno',
    };

    const typeLabels: Record<string, string> = {
        regular: 'Regular',
        opening: 'Abertura',
        closing: 'Fechamento',
        receiving: 'Recebimento',
    };

    return (
        <div className="min-h-[100dvh] bg-[#101d22] font-sans flex flex-col">
            {/* Header Sticky */}
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur-md border-b border-[#233f48] px-4 py-4">
                <div className="max-w-[480px] mx-auto w-full flex items-center gap-3">
                    <button
                        onClick={() => router.push('/turno')}
                        className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#1a2c32] border border-[#233f48] rounded-full text-white active:bg-[#233f48] transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex-1 min-w-0">
                        <p className="text-[#92bbc9] text-xs font-medium">Detalhes da Atividade</p>
                        <h1 className="text-white text-lg font-bold truncate leading-tight">
                            {checklist.name}
                        </h1>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-6 pb-32">
                <div className="max-w-[480px] mx-auto w-full flex flex-col gap-4">

                    {/* Inactive time window banner */}
                    {timeWindowStatus === 'before' && checklist.start_time && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
                            <span className="material-symbols-outlined text-amber-400 shrink-0">schedule</span>
                            <div>
                                <p className="text-amber-300 font-bold text-sm">Atividade Inativa</p>
                                <p className="text-amber-400/70 text-xs mt-0.5">
                                    {checklist.start_time && checklist.end_time
                                        ? `Disponível entre ${checklist.start_time} e ${checklist.end_time}`
                                        : `Disponível a partir das ${checklist.start_time}`}
                                </p>
                            </div>
                        </div>
                    )}

                    {timeWindowStatus === 'after' && checklist.end_time && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                            <span className="material-symbols-outlined text-red-400 shrink-0">warning</span>
                            <div>
                                <p className="text-red-400 font-bold text-sm">Atividade Atrasada</p>
                                <p className="text-red-400/60 text-xs mt-0.5">
                                    {checklist.start_time && checklist.end_time
                                        ? `A janela ${checklist.start_time} – ${checklist.end_time} já encerrou`
                                        : `O horário limite (${checklist.end_time}) já passou`}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Who assumed banner */}
                    {assumption && (
                        <div className={`border rounded-xl p-4 flex items-center gap-3 ${isAssumedByMe ? 'bg-[#13b6ec]/10 border-[#13b6ec]/30' : 'bg-[#1a2c32] border-[#233f48]'}`}>
                            <span className={`material-symbols-outlined shrink-0 ${isAssumedByMe ? 'text-[#13b6ec]' : 'text-[#92bbc9]'}`}>person</span>
                            <div>
                                <p className={`font-bold text-sm ${isAssumedByMe ? 'text-[#13b6ec]' : 'text-white'}`}>
                                    {isAssumedByMe ? 'Você assumiu esta atividade' : `Em execução por: ${assumption.user_name}`}
                                </p>
                                {!isAssumedByMe && (
                                    <p className="text-[#92bbc9] text-xs mt-0.5">Outro funcionário está executando esta atividade</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Activity info card */}
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl overflow-hidden">
                        {/* Name & description */}
                        <div className="p-5 border-b border-[#233f48]">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <h2 className="text-white text-xl font-black leading-snug">{checklist.name}</h2>
                                {checklist.is_required && (
                                    <span className="bg-[#13b6ec]/10 text-[#13b6ec] text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shrink-0">
                                        <span className="material-symbols-outlined text-[12px]">bolt</span>
                                        Obrigatório
                                    </span>
                                )}
                            </div>
                            {checklist.description ? (
                                <p className="text-[#92bbc9] text-sm leading-relaxed">{checklist.description}</p>
                            ) : (
                                <p className="text-[#325a67] text-sm italic">Sem descrição definida.</p>
                            )}
                        </div>

                        {/* Metadata rows */}
                        <div className="divide-y divide-[#233f48]/60">
                            {/* Task count */}
                            <div className="px-5 py-3.5 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[#92bbc9] text-sm">
                                    <span className="material-symbols-outlined text-[18px]">checklist</span>
                                    Itens no checklist
                                </div>
                                <span className="text-white font-bold text-sm">{tasks.length} {tasks.length === 1 ? 'item' : 'itens'}</span>
                            </div>

                            {/* Type */}
                            {checklist.checklist_type && checklist.checklist_type !== 'regular' && (
                                <div className="px-5 py-3.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[#92bbc9] text-sm">
                                        <span className="material-symbols-outlined text-[18px]">category</span>
                                        Tipo
                                    </div>
                                    <span className="text-white font-bold text-sm">{typeLabels[checklist.checklist_type] || checklist.checklist_type}</span>
                                </div>
                            )}

                            {/* Shift */}
                            <div className="px-5 py-3.5 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[#92bbc9] text-sm">
                                    <span className="material-symbols-outlined text-[18px]">wb_sunny</span>
                                    Turno
                                </div>
                                <span className="text-white font-bold text-sm">{shiftLabels[checklist.shift as string] || String(checklist.shift)}</span>
                            </div>

                            {/* Time window */}
                            {(checklist.start_time || checklist.end_time) && (
                                <div className="px-5 py-3.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[#92bbc9] text-sm">
                                        <span className="material-symbols-outlined text-[18px]">schedule</span>
                                        Janela de horário
                                    </div>
                                    <span className={`font-bold text-sm ${timeWindowStatus === 'active' || timeWindowStatus === 'always' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {checklist.start_time && checklist.end_time
                                            ? `${checklist.start_time} – ${checklist.end_time}`
                                            : checklist.start_time
                                                ? `A partir de ${checklist.start_time}`
                                                : `Até ${checklist.end_time}`}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Task preview */}
                    {tasks.length > 0 && (
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-5">
                            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#13b6ec] text-[18px]">list_alt</span>
                                Itens do Checklist
                            </h3>
                            <ul className="flex flex-col gap-2">
                                {tasks.slice(0, 5).map((task) => (
                                    <li key={task.id} className="flex items-center gap-2 text-[#92bbc9] text-sm">
                                        <span className="material-symbols-outlined text-[#325a67] text-[16px]">radio_button_unchecked</span>
                                        <span className="truncate">{task.title}</span>
                                        {task.is_critical && (
                                            <span className="shrink-0 text-[10px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">Crítico</span>
                                        )}
                                    </li>
                                ))}
                                {tasks.length > 5 && (
                                    <li className="text-[#325a67] text-xs mt-1">
                                        + {tasks.length - 5} {tasks.length - 5 === 1 ? 'item adicional' : 'itens adicionais'}
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}

                </div>
            </main>

            {/* Bottom Action */}
            <div className="fixed bottom-0 left-0 lg:left-64 right-0 px-4 pt-4 pb-20 lg:pb-4 bg-gradient-to-t from-[#0a1215] via-[#0a1215]/95 to-transparent z-40">
                <div className="max-w-[480px] mx-auto flex flex-col gap-2">
                    {timeWindowStatus === 'before' ? (
                        <button
                            disabled
                            className="w-full bg-[#1a2c32] text-[#325a67] font-bold text-base py-4 rounded-xl border border-[#233f48] cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">lock</span>
                            {checklist.start_time && checklist.end_time
                                ? `Disponível entre ${checklist.start_time} e ${checklist.end_time}`
                                : `Indisponível — abre às ${checklist.start_time}`}
                        </button>
                    ) : timeWindowStatus === 'after' ? (
                        <button
                            disabled
                            className="w-full bg-[#1a2c32] text-[#325a67] font-bold text-base py-4 rounded-xl border border-[#233f48] cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">lock</span>
                            Janela encerrada
                        </button>
                    ) : isAssumedByMe ? (
                        <button
                            onClick={() => router.push(`/turno/atividade/${checklistId}/executar`)}
                            className="w-full bg-[#13b6ec] hover:bg-[#10a1d4] text-[#0a1215] font-bold text-base py-4 rounded-xl shadow-[0_8px_20px_rgba(19,182,236,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                            Continuar execução
                        </button>
                    ) : isAssumedByOther ? (
                        <button
                            disabled
                            className="w-full bg-[#1a2c32] text-[#92bbc9] font-bold text-base py-4 rounded-xl border border-[#233f48] cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">person</span>
                            Assumida por {assumption?.user_name}
                        </button>
                    ) : (
                        <button
                            onClick={handleAssume}
                            disabled={assuming}
                            className="w-full bg-[#13b6ec] hover:bg-[#10a1d4] text-[#0a1215] font-bold text-base py-4 rounded-xl shadow-[0_8px_20px_rgba(19,182,236,0.3)] active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {assuming ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                                    Assumindo...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                    Assumir atividade
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
