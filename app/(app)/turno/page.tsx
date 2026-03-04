'use client';

import React, { useMemo } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useChecklists } from '@/lib/hooks/use-checklists';
import { useTurnoAtual } from '@/lib/hooks/use-execucoes';
import { useRouter } from 'next/navigation';
import { Checklist, ChecklistTask } from '@/lib/types';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function HomeTurnoPage() {
    const router = useRouter();
    const { restaurantId, restaurantName, userRole } = useRestaurantStore();
    const { data: checklists, isLoading: isLoadingChecklists } = useChecklists(restaurantId || undefined);
    const { data: execucoes, isLoading: isLoadingExecucoes } = useTurnoAtual(restaurantId || null);
    const [userName, setUserName] = React.useState<string>('');

    React.useEffect(() => {
        if (userRole && userRole !== 'staff') {
            router.replace('/dashboard');
        }
        createClient().auth.getUser().then(({ data }) => {
            if (data.user?.user_metadata?.name) {
                setUserName(data.user.user_metadata.name);
            }
        });
    }, [userRole, router]);

    // Lógica para descobrir o Turno Atual: (manhã: 06-12h, tarde: 12-18h, noite: 18-00h)
    const getShiftNow = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'afternoon';
        return 'evening';
    };

    const currentShift = getShiftNow();

    const renderTasks = useMemo(() => {
        if (!checklists || !execucoes) return [];

        const allTasks: (ChecklistTask & { checklist: Checklist, status?: 'done' | 'skipped' | 'flagged' })[] = [];

        // Filtra os checklists "ativos" e que batem com o shift atual ou "any"
        const allowedChecklists = checklists.filter(c =>
            c.active && (c.shift === currentShift || c.shift === 'any')
        );

        allowedChecklists.forEach(checklist => {
            if (checklist.tasks) {
                checklist.tasks.forEach(task => {
                    const execution = execucoes.find((e: { task_id: string; status: 'done' | 'skipped' | 'flagged' }) => e.task_id === task.id);
                    allTasks.push({
                        ...task,
                        checklist,
                        status: execution?.status
                    });
                });
            }
        });

        // Ordena: primeiro as não-concluídas, depois as concluídas
        return allTasks.sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            return 0;
        });

    }, [checklists, execucoes, currentShift]);

    const totalTasks = renderTasks.length;
    const completedTasks = renderTasks.filter(t => t.status === 'done').length;
    const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const isLoading = isLoadingChecklists || isLoadingExecucoes;

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#f6f8f8] dark:bg-[#101d22]">
                <div className="animate-spin text-[#13b6ec]">
                    <span className="material-symbols-outlined text-4xl">refresh</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f6f8f8] dark:bg-[#101d22] font-display text-slate-900 dark:text-white pb-24 mx-auto max-w-[500px] w-full flex flex-col items-center">
            {/* Header Reduzido Mobile */}
            <header className="w-full flex items-center justify-between px-6 py-4 bg-white dark:bg-[#111e22] border-b border-gray-200 dark:border-[#233f48] sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <h1 className="text-sm font-bold leading-tight truncate">{restaurantName || 'Carregando...'}</h1>
                        <p className="text-xs text-slate-500 dark:text-[#92bbc9] truncate">{userName} • STAFF</p>
                    </div>
                </div>
                <button className="relative text-slate-500 dark:text-[#92bbc9] p-2 hover:bg-gray-100 dark:hover:bg-[#233f48] rounded-full">
                    <span className="material-symbols-outlined">notifications</span>
                    <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white dark:border-[#111e22]"></span>
                </button>
            </header>

            <main className="w-full flex-1 flex flex-col p-6 gap-6">
                {/* Saudação */}
                <div className="w-full flex flex-col gap-1 mt-2">
                    <h2 className="text-2xl font-bold tracking-tight">Olá, {userName.split(' ')[0]}! 👋</h2>
                    <p className="text-sm text-slate-500 dark:text-[#92bbc9]">
                        {totalTasks - completedTasks > 0
                            ? `Você tem ${totalTasks - completedTasks} tarefas pendentes para este turno.`
                            : 'Todas as tarefas concluídas! Excelente trabalho.'}
                    </p>
                </div>

                {/* Card de Progresso */}
                <div className="w-full bg-white dark:bg-[#16262c] rounded-xl p-5 border border-gray-200 dark:border-[#233f48] shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-[#92bbc9]">Progresso do Turno</p>
                        <span className="text-3xl font-bold text-primary">{progressPercentage}%</span>
                    </div>
                    <div className="w-full overflow-hidden h-2 mb-2 text-xs flex rounded-full bg-gray-100 dark:bg-[#233f48]">
                        <div style={{ width: `${progressPercentage}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary transition-all duration-500"></div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#92bbc9]">{completedTasks} de {totalTasks} tarefas concluídas</p>
                </div>

                {/* Lista de Tarefas */}
                <div className="w-full flex flex-col gap-3 mt-2">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Lista de Tarefas</h3>
                    </div>

                    {renderTasks.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 dark:text-[#92bbc9] bg-white dark:bg-[#16262c] rounded-xl border border-dashed border-gray-200 dark:border-[#233f48]">
                            Não há tarefas cadastradas para o seu turno atual.
                        </div>
                    ) : (
                        renderTasks.map((task) => (
                            <Link
                                href={`/turno/tarefa/${task.id}?c=${task.checklist_id}`}
                                key={task.id}
                                className={`group flex flex-col p-4 rounded-xl transition-all border
                                    ${task.status === 'done'
                                        ? 'bg-gray-50/50 dark:bg-[#111e22]/50 border-transparent opacity-60 hover:opacity-100'
                                        : 'bg-white dark:bg-[#16262c] border-gray-200 dark:border-[#233f48] shadow-sm hover:border-primary/50'
                                    }
                                `}
                            >
                                <div className="flex items-start gap-4">
                                    {/* Checkbox Icon Mock */}
                                    <div className={`mt-0.5 shrink-0 flex items-center justify-center size-6 rounded-full border-2 
                                         ${task.status === 'done' ? 'bg-primary border-primary text-[#101d22]' : 'border-gray-300 dark:border-[#233f48] group-hover:border-primary/50'}
                                     `}>
                                        {task.status === 'done' && <span className="material-symbols-outlined text-[16px] font-bold">check</span>}
                                    </div>

                                    <div className="flex-1 flex flex-col gap-1">
                                        <h4 className={`text-sm font-bold ${task.status === 'done' ? 'line-through text-slate-400 dark:text-[#92bbc9]' : 'text-slate-900 dark:text-white'}`}>
                                            {task.title}
                                        </h4>
                                        <p className="text-xs text-slate-500 dark:text-[#92bbc9] line-clamp-1">{task.checklist?.name} • {task.checklist?.category}</p>
                                    </div>

                                    {task.is_critical && task.status !== 'done' && (
                                        <span title="Requer Upload de Foto" className="shrink-0 flex items-center justify-center p-1 rounded-sm bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                            <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                                        </span>
                                    )}
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </main>

            {/* Float Action Navigation */}
            <div className="fixed bottom-0 left-0 right-0 w-full bg-white dark:bg-[#111e22] border-t border-gray-200 dark:border-[#233f48] px-6 py-4 flex justify-between items-center max-w-[500px] mx-auto z-40 pb-safe">
                <Link href="/historico" className="flex flex-col items-center gap-1 text-slate-500 dark:text-[#92bbc9] hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-2xl">history</span>
                    <span className="text-[10px] font-medium uppercase">Histórico</span>
                </Link>

                <Link href="/turno" className="flex flex-col items-center gap-1 text-primary transition-colors">
                    <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>fact_check</span>
                    <span className="text-[10px] font-medium uppercase">Turno Atual</span>
                </Link>

                <div className="flex flex-col items-center gap-1 text-slate-500 dark:text-[#92bbc9] hover:text-red-400 transition-colors cursor-not-allowed opacity-50">
                    <span className="material-symbols-outlined text-2xl">warning</span>
                    <span className="text-[10px] font-medium uppercase">Incidente</span>
                </div>
            </div>
        </div>
    );
}
