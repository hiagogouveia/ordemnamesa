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
import { sortChecklistsByPriority } from '@/lib/utils/checklist-priority';
import { RoutineCard } from '@/components/checklists/routine-card';

function getActivityTimeStatus(
    startTime: string | undefined,
    endTime: string | undefined,
    currentTime: string
): 'always' | 'before' | 'active' | 'after' {
    if (!startTime && !endTime) return 'always';
    if (startTime && currentTime < startTime) return 'before';
    if (endTime && currentTime > endTime) return 'after';
    return 'active';
}

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
    const hasNoRoles = !userLoading && user !== null && !loadingKanban && (kanbanData?.checklists?.length ?? 0) === 0 && !loadingUserRoles && userRolesData.length === 0;

    const activePurchaseList = useMemo(() => {
        if (!userRoleIds.length) return null;
        return purchaseLists.find(pl => pl.target_role_ids?.some((id: string) => userRoleIds.includes(id)));
    }, [purchaseLists, userRoleIds]);

    const currentMinutes = useMemo(() => {
        if (!timeNow) return 0;
        const [h, m] = timeNow.split(':').map(Number);
        return h * 60 + m;
    }, [timeNow]);

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

        // Smart sort
        todo.sort((a, b) => {
            const diff = sortChecklistsByPriority(a as any, b as any, currentMinutes);
            if (diff !== 0) return diff;
            return (b.is_required ? 1 : 0) - (a.is_required ? 1 : 0);
        });

        doing.sort((a, b) => {
            const diff = sortChecklistsByPriority(a as any, b as any, currentMinutes);
            if (diff !== 0) return diff;
            return (b.is_required ? 1 : 0) - (a.is_required ? 1 : 0);
        });

        return { todoActivities: todo, doingActivities: doing, doneActivities: done };
    }, [kanbanData, user, timeNow, currentMinutes]);

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

    const userAreas = useMemo(() => {
        if (!kanbanData?.checklists) return [];
        const labels = kanbanData.checklists
            .map(cl => cl.roles?.name || cl.areas?.name)
            .filter((name): name is string => Boolean(name));
        return Array.from(new Set(labels)).sort();
    }, [kanbanData]);

    const [activeArea, setActiveArea] = useState<string>('');

    useEffect(() => {
        if (userAreas.length > 0 && !userAreas.includes(activeArea)) {
            setActiveArea(userAreas[0]);
        }
    }, [userAreas, activeArea]);

    const getFiltered = <T extends { roles?: { name: string }; areas?: { name: string } }>(activities: T[]): T[] => {
        if (!activeArea) return [];
        return activities.filter(a => a.roles?.name === activeArea || a.areas?.name === activeArea);
    };

    const filteredTodo = useMemo(() => getFiltered(todoActivities), [todoActivities, activeArea, userRolesData]);
    const filteredDoing = useMemo(() => getFiltered(doingActivities), [doingActivities, activeArea, userRolesData]);
    const filteredDone = useMemo(() => getFiltered(doneActivities), [doneActivities, activeArea, userRolesData]);

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
                            <p className="text-[#92bbc9] text-xs mt-0.5">Fale com seu gestor para ser adicionado a uma área.</p>
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

                        {userAreas.length > 1 && (
                            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide snap-x">
                                {userAreas.map((area) => (
                                    <button
                                        key={area}
                                        onClick={() => setActiveArea(area)}
                                        className={`
                                            snap-start whitespace-nowrap px-6 py-3 rounded-full text-sm font-semibold transition-colors
                                            ${activeArea === area
                                                ? 'bg-[#00c6d2] text-[#0f1b21]'
                                                : 'bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]'
                                            }
                                        `}
                                        style={{ minHeight: '44px' }}
                                    >
                                        {area}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* PARA FAZER */}
                        <section className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#92bbc9]">list_alt</span>
                                <h2 className="text-white font-bold tracking-wide uppercase text-sm">Para Fazer</h2>
                                <span className="ml-auto bg-[#233f48] text-white text-xs px-2 py-0.5 rounded-full">{filteredTodo.length}</span>
                            </div>

                            {filteredTodo.length === 0 ? (
                                <div className="text-center py-8 text-[#92bbc9] text-sm bg-[#1a2c32] rounded-xl border border-dashed border-[#233f48]">
                                    {kanbanData?.checklists.length === 0 ? "Nenhuma rotina ativa para você" : "✓ Todas as rotinas desta área iniciadas!"}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {filteredTodo.map(activity => {
                                        const isAssignedToOther = Boolean(activity.assigned_to_user_id && activity.assigned_to_user_id !== user?.id);
                                        const assumption = kanbanData?.assumptions?.find(a => a.checklist_id === activity.id);
                                        return (
                                            <RoutineCard
                                                key={activity.id}
                                                variant="collaborator_todo"
                                                title={activity.name}
                                                itemsCount={activity.taskCount}
                                                start_time={activity.start_time as string | undefined}
                                                end_time={activity.end_time as string | undefined}
                                                currentMinutes={currentMinutes}
                                                isRequired={activity.is_required}
                                                isAssignedToOther={isAssignedToOther}
                                                assumptionName={assumption?.user_name}
                                                area={activity.roles?.name || activity.areas?.name}
                                                onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* EM ANDAMENTO */}
                        {filteredDoing.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">hourglass_top</span>
                                    <h2 className="text-amber-400 font-bold tracking-wide uppercase text-sm">Em Andamento</h2>
                                    <span className="ml-auto bg-amber-400/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">{filteredDoing.length}</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {filteredDoing.map(activity => {
                                        const assumption = kanbanData?.assumptions?.find(a => a.checklist_id === activity.id);
                                        return (
                                            <RoutineCard
                                                key={activity.id}
                                                variant="collaborator_doing"
                                                title={activity.name}
                                                itemsCount={activity.taskCount}
                                                start_time={activity.start_time as string | undefined}
                                                end_time={activity.end_time as string | undefined}
                                                currentMinutes={currentMinutes}
                                                progress={activity.progress}
                                                flaggedCount={activity.flaggedTasksCount}
                                                assumptionName={assumption?.user_name}
                                                area={activity.roles?.name || activity.areas?.name}
                                                onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                            />
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* CONCLUÍDAS */}
                        <details className="group">
                            <summary className="flex items-center justify-between cursor-pointer p-3 bg-[#1a2c32] rounded-xl border border-[#233f48] select-none list-none [&::-webkit-details-marker]:hidden">
                                <div className="flex items-center gap-2 text-emerald-400">
                                    <span className="material-symbols-outlined text-lg">task_alt</span>
                                    <h2 className="font-bold tracking-wide uppercase text-sm">Rotinas Concluídas ({filteredDone.length})</h2>
                                </div>
                                <span className="material-symbols-outlined text-[#92bbc9] group-open:rotate-180 transition-transform">expand_more</span>
                            </summary>
                            <div className="flex flex-col gap-2 mt-3 pl-2 border-l-2 border-emerald-900/30">
                                {filteredDone.length === 0 && <span className="text-[#325a67] text-xs p-2">Nenhuma rotina finalizada nesta área hoje.</span>}
                                {filteredDone.map(activity => {
                                    const assumption = kanbanData?.assumptions?.find(a => a.checklist_id === activity.id);
                                    const hasObservation = !!assumption?.observation;

                                    return (
                                        <div key={activity.id} 
                                            onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                            className="flex justify-between items-center cursor-pointer hover:bg-[#1a2c32]/70 bg-[#1a2c32]/50 rounded-lg p-3 transition-colors border border-transparent hover:border-[#233f48]">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-400/80 text-sm">check_circle</span>
                                                <span className="text-white/80 text-sm">{activity.name}</span>
                                                {hasObservation && (
                                                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px] ml-1" title="Contém observações">chat</span>
                                                )}
                                            </div>
                                            <span className="text-[#92bbc9] text-xs">{activity.taskCount} itens</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </details>

                    </div>
                )}
            </main>

        </div>
    );
}
