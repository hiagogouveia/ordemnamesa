'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useKanbanTasks, KanbanChecklist } from '@/lib/hooks/use-tasks';
import { usePurchaseLists } from '@/lib/hooks/use-purchases';
import { useUserRoles } from '@/lib/hooks/use-user-roles-shifts';
import { useShifts } from '@/lib/hooks/use-shifts';
import { getCurrentShift } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function KanbanPage() {
    const { restaurantId } = useRestaurantStore();
    const router = useRouter();

    const [user, setUser] = useState<{ id: string; name: string } | null>(null);
    const [userLoading, setUserLoading] = useState(true);

    // Fetch auth user
    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            if (data.user) {
                setUser({ id: data.user.id, name: data.user.user_metadata?.name || 'Membro' });
            }
            setUserLoading(false);
        });
    }, []);

    const { data: kanbanData, isLoading: loadingKanban } = useKanbanTasks(restaurantId || undefined);
    const { data: shifts = [] } = useShifts(restaurantId || undefined);
    const { data: userRolesData = [], isLoading: loadingUserRoles } = useUserRoles(restaurantId || undefined, user?.id);
    const { data: purchaseLists = [] } = usePurchaseLists(restaurantId || undefined, 'open');

    const [timeNow, setTimeNow] = useState<string>('');

    useEffect(() => {
        setTimeNow(new Date().toTimeString().slice(0, 5));
        const interval = setInterval(() => setTimeNow(new Date().toTimeString().slice(0, 5)), 60000);
        return () => clearInterval(interval);
    }, []);

    // Derived states
    const currentShift = useMemo(() => getCurrentShift(shifts, timeNow), [shifts, timeNow]);
    const userRoleIds = useMemo(() => userRolesData.map(ur => ur.role_id), [userRolesData]);
    const hasNoRoles = !userLoading && user !== null && !loadingUserRoles && userRolesData.length === 0;

    const activePurchaseList = useMemo(() => {
        if (!userRoleIds.length) return null;
        return purchaseLists.find(pl => pl.target_role_ids?.some((id: string) => userRoleIds.includes(id)));
    }, [purchaseLists, userRoleIds]);

    const { todoActivities, doingActivities, doneActivities } = useMemo(() => {
        if (!kanbanData || !user) return { todoActivities: [], doingActivities: [], doneActivities: [] };

        const { checklists, tasks, executions } = kanbanData;
        const execMapByTaskId = new Map(executions.map(e => [e.task_id, e]));

        const todo: (KanbanChecklist & { taskCount: number; progress: number; flaggedTasksCount: number })[] = [];
        const doing: (KanbanChecklist & { taskCount: number; progress: number; flaggedTasksCount: number })[] = [];
        const done: (KanbanChecklist & { taskCount: number; progress: number; flaggedTasksCount: number })[] = [];

        for (const cl of checklists) {
            const clTasks = tasks.filter(t => t.checklist_id === cl.id);
            if (clTasks.length === 0) continue; // Skip empty checklists

            const doneTasksCount = clTasks.filter(t => {
                const exec = execMapByTaskId.get(t.id);
                return exec && exec.status === 'done';
            }).length;

            const flaggedTasksCount = clTasks.filter(t => {
                const exec = execMapByTaskId.get(t.id);
                return exec && exec.status === 'flagged';
            }).length;

            const doingTasksCount = clTasks.filter(t => {
                const exec = execMapByTaskId.get(t.id);
                return exec && exec.status === 'doing';
            }).length;

            const progress = Math.round((doneTasksCount / clTasks.length) * 100);
            const enriched = { ...cl, taskCount: clTasks.length, progress, flaggedTasksCount };

            if (doneTasksCount === clTasks.length) {
                done.push(enriched);
            } else if (doneTasksCount > 0 || doingTasksCount > 0 || flaggedTasksCount > 0) {
                doing.push(enriched);
            } else {
                todo.push(enriched);
            }
        }

        todo.sort((a, b) => (b.is_required ? 1 : 0) - (a.is_required ? 1 : 0));

        return { todoActivities: todo, doingActivities: doing, doneActivities: done };
    }, [kanbanData, user]);

    const allRequiredDone = useMemo(() => {
        if (!kanbanData) return false;
        const requiredChecklists = kanbanData.checklists.filter(c => c.is_required);
        if (requiredChecklists.length === 0) return false;
        
        return requiredChecklists.every(c => {
            const clTasks = kanbanData.tasks.filter(t => t.checklist_id === c.id);
            if (clTasks.length === 0) return true;
            return clTasks.every(t => {
                const exec = kanbanData.executions.find(e => e.task_id === t.id);
                return exec && exec.status === 'done';
            });
        });
    }, [kanbanData]);

    // Modals
    const [assumeModal, setAssumeModal] = useState<KanbanChecklist | null>(null);

    const handleAssume = (checklist: KanbanChecklist) => {
        setAssumeModal(null);
        router.push(`/turno/atividade/${checklist.id}`);
    };

    // UI Helpers
    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Bom dia';
        if (h < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    return (
        <div className="min-h-full bg-[#101d22] font-sans pb-20">
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48] px-4 py-4 md:px-8">
                <div className="max-w-[480px] mx-auto w-full flex flex-col gap-2">
                    <h1 className="text-white text-xl md:text-2xl font-black">
                        {getGreeting()}, {user?.name.split(' ')[0] || '...'}
                    </h1>
                    <div className="flex justify-between items-center text-sm font-medium">
                        <span className="text-[#13b6ec]">
                            {currentShift ? `Turno: ${currentShift.name}` : 'Fora do horário de turno'}
                        </span>
                        <span className="text-[#92bbc9] bg-[#1a2c32] px-2 py-1 rounded-md border border-[#233f48]">
                            {todoActivities.length} rotinas para fazer
                        </span>
                    </div>
                </div>
            </header>

            <main className="max-w-[480px] mx-auto w-full p-4 flex flex-col gap-6">
                {allRequiredDone && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
                        <span className="material-symbols-outlined text-emerald-400 text-xl shrink-0">task_alt</span>
                        <p className="text-emerald-300 font-bold text-sm">Todas as rotinas obrigatórias concluídas!</p>
                    </div>
                )}

                {hasNoRoles && (
                    <div className="bg-[#1a2c32] border border-amber-500/40 rounded-xl p-4 flex items-start gap-3">
                        <span className="material-symbols-outlined text-amber-400 text-xl shrink-0 mt-0.5">warning</span>
                        <div>
                            <p className="text-amber-300 font-bold text-sm">Você não tem área atribuída</p>
                            <p className="text-[#92bbc9] text-xs mt-0.5">Fale com seu gestor para ser adicionado a uma área. Enquanto isso, apenas tarefas gerais são exibidas.</p>
                        </div>
                    </div>
                )}

                {activePurchaseList && (
                    <div className="bg-[#1a2c32] border border-[#f59e0b] rounded-xl p-4 flex flex-col gap-3 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                        <div className="flex items-center gap-2 text-[#f59e0b] font-bold text-sm">
                            <span className="material-symbols-outlined">inventory_2</span>
                            📦 Pedido aguardando conferência
                        </div>
                        <p className="text-[#92bbc9] text-xs">A lista &ldquo;{activePurchaseList.title}&rdquo; tem itens designados para sua função que acabaram de chegar.</p>
                        <Link href={`/recebimento/${activePurchaseList.id}`} className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 bg-[#f59e0b] hover:bg-[#d97706] text-[#111e22] rounded-lg font-bold transition-colors">
                            <span className="material-symbols-outlined text-lg">fact_check</span> Conferir Agora
                        </Link>
                    </div>
                )}

                {loadingKanban ? (
                    <div className="flex flex-col gap-3 animate-pulse">
                        <div className="h-10 bg-[#1a2c32] rounded-lg w-full mb-4" />
                        <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                        <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">

                        {/* PARA FAZER */}
                        <section className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#92bbc9]">list_alt</span>
                                <h2 className="text-white font-bold tracking-wide uppercase text-sm">Para Fazer</h2>
                                <span className="ml-auto bg-[#233f48] text-white text-xs px-2 py-0.5 rounded-full">{todoActivities.length}</span>
                            </div>

                            {todoActivities.length === 0 ? (
                                <div className="text-center py-8 text-[#92bbc9] text-sm bg-[#1a2c32] rounded-xl border border-dashed border-[#233f48]">
                                    {kanbanData?.checklists.length === 0 ? "Nenhuma rotina ativa para você" : "✓ Todas as rotinas iniciadas!"}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {todoActivities.map(activity => {
                                        const isAssignedToOther = activity.assigned_to_user_id && activity.assigned_to_user_id !== user?.id;
                                        return (
                                            <div key={activity.id}
                                                onClick={() => !isAssignedToOther && setAssumeModal(activity)}
                                                className={`bg-[#1a2c32] rounded-xl p-4 flex flex-col gap-2 shadow-sm transition-all ${activity.is_required ? 'border-l-4 border-[#13b6ec] border border-[#13b6ec]/30' : 'border-l-4 border-[#233f48]'} ${!isAssignedToOther ? 'cursor-pointer hover:bg-[#1f363d]' : 'opacity-75'}`}>

                                                <div className="flex justify-between items-start gap-3">
                                                    <div>
                                                        <span className="text-white text-base font-bold leading-snug">{activity.name}</span>
                                                        <p className="text-[#92bbc9] text-xs mt-1">{activity.taskCount} itens</p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                        {activity.is_required && (
                                                            <span className="bg-[#13b6ec]/10 text-[#13b6ec] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[12px]">bolt</span> Obrigatório
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#233f48]/50 text-sm font-bold text-[#92bbc9]">
                                                    {isAssignedToOther ? (
                                                        <span className="text-[#325a67]">Atribuída a outro funcionário</span>
                                                    ) : (
                                                        <span className="text-[#13b6ec] ml-auto flex items-center gap-1">Assumir Tarefa <span className="material-symbols-outlined text-[16px]">arrow_right_alt</span></span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* EM ANDAMENTO */}
                        {doingActivities.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">hourglass_top</span>
                                    <h2 className="text-amber-400 font-bold tracking-wide uppercase text-sm">Em Andamento</h2>
                                    <span className="ml-auto bg-amber-400/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">{doingActivities.length}</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {doingActivities.map(activity => (
                                        <div key={activity.id} 
                                            onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                            className="bg-[#1a2c32] cursor-pointer hover:bg-[#1f363d] transition-colors border border-amber-500/20 rounded-xl p-4 flex flex-col gap-3">
                                            
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-white text-base font-bold leading-snug">{activity.name}</span>
                                                {activity.flaggedTasksCount > 0 && (
                                                    <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold bg-red-500/10 px-2 py-1 rounded">
                                                        <span className="material-symbols-outlined text-[12px]">warning</span> Impedimento
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 w-full bg-[#101d22] rounded-full h-2.5 overflow-hidden">
                                                    <div className="bg-amber-400 h-full rounded-full transition-all" style={{ width: `${activity.progress}%` }}></div>
                                                </div>
                                                <span className="text-amber-400 text-xs font-bold shrink-0">{activity.progress}%</span>
                                            </div>

                                            <div className="flex items-center mt-1 text-sm font-bold">
                                                <span className="text-amber-400 ml-auto flex items-center gap-1">Continuar <span className="material-symbols-outlined text-[16px]">arrow_right_alt</span></span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* CONCLUÍDAS */}
                        <details className="group">
                            <summary className="flex items-center justify-between cursor-pointer p-3 bg-[#1a2c32] rounded-xl border border-[#233f48] select-none list-none [&::-webkit-details-marker]:hidden">
                                <div className="flex items-center gap-2 text-emerald-400">
                                    <span className="material-symbols-outlined text-lg">task_alt</span>
                                    <h2 className="font-bold tracking-wide uppercase text-sm">Rotinas Concluídas ({doneActivities.length})</h2>
                                </div>
                                <span className="material-symbols-outlined text-[#92bbc9] group-open:rotate-180 transition-transform">expand_more</span>
                            </summary>
                            <div className="flex flex-col gap-2 mt-3 pl-2 border-l-2 border-emerald-900/30">
                                {doneActivities.length === 0 && <span className="text-[#325a67] text-xs p-2">Nenhuma rotina finalizada hoje.</span>}
                                {doneActivities.map(activity => (
                                    <div key={activity.id} 
                                        onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                        className="flex justify-between items-center cursor-pointer hover:bg-[#1a2c32]/70 bg-[#1a2c32]/50 rounded-lg p-3 transition-colors border border-transparent hover:border-[#233f48]">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-400/80 text-sm">check_circle</span>
                                            <span className="text-white/80 text-sm">{activity.name}</span>
                                        </div>
                                        <span className="text-[#92bbc9] text-xs">{activity.taskCount} itens</span>
                                    </div>
                                ))}
                            </div>
                        </details>

                    </div>
                )}
            </main>

            {assumeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-6 w-full max-w-[360px] flex flex-col gap-4 shadow-xl">
                        <h3 className="text-white font-bold text-lg leading-tight">Assumir Rotina</h3>
                        <p className="text-[#92bbc9] text-sm">Deseja iniciar a execução de <strong className="text-white">&ldquo;{assumeModal.name}&rdquo;</strong>?</p>
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => setAssumeModal(null)} className="flex-1 py-3 rounded-xl bg-[#233f48] text-white font-medium hover:bg-[#2c4e5a] transition-colors text-sm">Cancelar</button>
                            <button onClick={() => handleAssume(assumeModal)} className="flex-1 py-3 rounded-xl bg-[#13b6ec] text-[#111e22] font-bold hover:bg-[#10a1d4] transition-colors shadow-[0_0_15px_rgba(19,182,236,0.2)] text-sm flex justify-center items-center gap-2">
                                Iniciar <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
