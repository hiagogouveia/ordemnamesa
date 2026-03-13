'use client';

import React, { useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useActivityData, useToggleActivityTask } from '@/lib/hooks/use-activity-execution';
import { ExecutionItem } from '@/components/turno/execution-item';

export default function ActivityExecutionPage() {
    const router = useRouter();
    const params = useParams();
    const checklistId = params.id as string;
    const { restaurantId } = useRestaurantStore();

    const { data: activityData, isLoading, isError } = useActivityData(restaurantId || undefined, checklistId);
    const toggleTask = useToggleActivityTask();

    const { checklist, tasks, executions } = activityData || {};

    const progress = useMemo(() => {
        if (!tasks || tasks.length === 0) return 0;
        const doneCount = tasks.filter(t => 
            executions?.some(e => e.task_id === t.id && e.status === 'done')
        ).length;
        return Math.round((doneCount / tasks.length) * 100);
    }, [tasks, executions]);

    const handleToggle = async (taskId: string, executionId: string | undefined, isDone: boolean) => {
        if (!restaurantId || !checklistId) return;
        try {
            await toggleTask.mutateAsync({
                restaurantId,
                checklistId,
                taskId,
                executionId,
                isDone
            });
        } catch (e) {
            console.error('Erro ao alternar tarefa:', e);
            // Optimistic UI will handle reverting the state automatically
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#101d22] flex flex-col pt-12 p-4 items-center animate-pulse">
                <div className="h-12 w-full max-w-[480px] bg-[#1a2c32] rounded-xl mb-6"></div>
                <div className="h-4 w-full max-w-[480px] bg-[#1a2c32] rounded-full mb-8"></div>
                <div className="w-full max-w-[480px] space-y-4">
                    <div className="h-20 bg-[#1a2c32] rounded-2xl w-full"></div>
                    <div className="h-20 bg-[#1a2c32] rounded-2xl w-full"></div>
                    <div className="h-20 bg-[#1a2c32] rounded-2xl w-full"></div>
                </div>
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

    const isAllDone = progress === 100;

    return (
        <div className="min-h-[100dvh] bg-[#101d22] font-sans flex flex-col">
            {/* Header Sticky - Mobile First */}
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur-md border-b border-[#233f48] px-4 py-4">
                <div className="max-w-[480px] mx-auto w-full flex items-center gap-3">
                    <button 
                        onClick={() => router.push('/turno')}
                        className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#1a2c32] border border-[#233f48] rounded-full text-white active:bg-[#233f48] transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-white text-lg font-bold truncate leading-tight">
                            {checklist.name}
                        </h1>
                        <p className="text-[#92bbc9] text-xs font-medium truncate">
                            Execução de Atividade
                        </p>
                    </div>
                </div>
                
                {/* Progress Bar Area */}
                <div className="max-w-[480px] mx-auto w-full mt-4">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-white font-bold text-sm">Progresso</span>
                        <span className={`text-sm font-bold ${isAllDone ? 'text-[#13b6ec]' : 'text-[#92bbc9]'}`}>
                            {progress}%
                        </span>
                    </div>
                    <div className="w-full h-3 bg-[#1a2c32] rounded-full overflow-hidden border border-[#233f48]/50">
                        <div 
                            className={`h-full transition-all duration-700 ease-out rounded-full ${isAllDone ? 'bg-[#13b6ec] shadow-[0_0_10px_rgba(19,182,236,0.5)]' : 'bg-gradient-to-r from-[#13b6ec]/70 to-[#13b6ec]'}`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-[480px] mx-auto w-full flex flex-col gap-4 pb-24">
                    
                    {/* Success Banner */}
                    <div 
                        className={`
                            bg-[#13b6ec]/10 border border-[#13b6ec]/30 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center
                            transition-all duration-500 ease-in-out overflow-hidden origin-top
                            ${isAllDone ? 'max-h-[200px] opacity-100 scale-y-100 mb-2' : 'max-h-0 opacity-0 scale-y-0 m-0 border-none p-0'}
                        `}
                    >
                        <div className="w-12 h-12 bg-[#13b6ec] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(19,182,236,0.4)] mb-1">
                            <span className="material-symbols-outlined text-[#0a1215] text-2xl font-bold">celebration</span>
                        </div>
                        <h2 className="text-[#13b6ec] font-bold text-lg">Atividade Concluída!</h2>
                        <p className="text-[#13b6ec]/80 text-sm">Excelente trabalho. Você pode voltar ao painel ou revisar as respostas.</p>
                    </div>

                    {/* Task List */}
                    <div className="flex flex-col gap-3">
                        {tasks.map(task => {
                            const execution = executions?.find(e => e.task_id === task.id);
                            return (
                                <ExecutionItem 
                                    key={task.id} 
                                    task={task} 
                                    execution={execution}
                                    onToggle={handleToggle}
                                />
                            );
                        })}
                        {tasks.length === 0 && (
                            <div className="text-center py-10 text-[#92bbc9] bg-[#1a2c32] rounded-2xl border border-dashed border-[#233f48]">
                                Nenhum item neste checklist.
                            </div>
                        )}
                    </div>

                </div>
            </main>
            
            {/* Bottom Action Area (Visible only when 100%) */}
            {isAllDone && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a1215] via-[#0a1215]/90 to-transparent z-40">
                    <div className="max-w-[480px] mx-auto">
                        <button 
                            onClick={() => router.push('/turno')}
                            className="w-full bg-[#13b6ec] hover:bg-[#10a1d4] text-[#0a1215] font-bold text-lg py-4 rounded-xl shadow-[0_8px_20px_rgba(19,182,236,0.3)] active:scale-95 transition-all"
                        >
                            Voltar ao Turno
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
