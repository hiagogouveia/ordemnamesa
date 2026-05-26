'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/providers/use-session';
import { useAccountSessionStore } from '@/lib/store/account-session-store';
import { useKanbanTasks, KanbanChecklist } from '@/lib/hooks/use-tasks';
import { useUserRoles } from '@/lib/hooks/use-user-roles-shifts';
import { useShifts } from '@/lib/hooks/use-shifts';
import { useMyAreas } from '@/lib/hooks/use-user-areas';
import { getCurrentShift } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getRoutineState, type RoutineStateInfo } from '@/lib/utils/routine-state';
import type { Scope } from '@/lib/types/scope';
import { useReceivingExpectations, useReceivingTemplates, useCreateQuickReceiving } from '@/lib/hooks/use-receiving';
import { TaskRow } from '@/components/turno/task-row';
import { groupOperations, type OperationItem } from '@/lib/utils/operations-grouping';

const ACTIVE_AREA_STORAGE_PREFIX = 'turno:active-area:';
const readStoredArea = (scopeKey: string): string => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem(ACTIVE_AREA_STORAGE_PREFIX + scopeKey) ?? ''; }
    catch { return ''; }
};
const writeStoredArea = (scopeKey: string, areaId: string): void => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(ACTIVE_AREA_STORAGE_PREFIX + scopeKey, areaId); } catch {}
};

export default function KanbanPage() {
    const session = useSession();
    const restaurantId = session.restaurantId;
    const userId = session.userId;
    const userLoading = session.status === 'loading';
    const user = session.status === 'authenticated'
        ? { id: session.userId, name: session.userName }
        : null;
    const router = useRouter();

    const accountMode = useAccountSessionStore((s) => s.mode);
    const accountId = useAccountSessionStore((s) => s.accountId);
    const isGlobal = accountMode === 'global';

    const scope: Scope | undefined = useMemo(() => {
        if (isGlobal && accountId) return { mode: 'global', accountId };
        if (restaurantId) return { mode: 'single', restaurantId };
        return undefined;
    }, [isGlobal, accountId, restaurantId]);

    const { data: kanbanData, isLoading: loadingKanban } = useKanbanTasks(scope, userId);
    const { data: shifts = [] } = useShifts(restaurantId || undefined);
    const { data: userRolesData = [], isLoading: loadingUserRoles } = useUserRoles(restaurantId || undefined, userId);
    const { data: myAreaAssignments = [] } = useMyAreas(restaurantId || undefined, userId);
    const { data: receivingExpectations = [] } = useReceivingExpectations(
        isGlobal ? undefined : restaurantId || undefined,
    );
    const { data: receivingTemplates = [] } = useReceivingTemplates(
        isGlobal ? undefined : restaurantId || undefined,
    );

    // Modal de novo recebimento (template ou rápido).
    const [showReceivingPicker, setShowReceivingPicker] = useState(false);
    const [receivingPickerMode, setReceivingPickerMode] = useState<'pick' | 'quick'>('pick');
    const [quickSupplier, setQuickSupplier] = useState('');
    const [quickTasks, setQuickTasks] = useState<string[]>(['Conferir mercadoria recebida']);
    const [quickError, setQuickError] = useState<string | null>(null);
    const createQuickReceiving = useCreateQuickReceiving();

    const closeReceivingPicker = () => {
        setShowReceivingPicker(false);
        setTimeout(() => {
            setReceivingPickerMode('pick');
            setQuickSupplier('');
            setQuickTasks(['Conferir mercadoria recebida']);
            setQuickError(null);
        }, 150);
    };

    const [timeNow, setTimeNow] = useState<string>('');
    useEffect(() => {
        setTimeNow(new Date().toTimeString().slice(0, 5));
        const interval = setInterval(() => setTimeNow(new Date().toTimeString().slice(0, 5)), 60000);
        return () => clearInterval(interval);
    }, []);

    const currentShift = useMemo(() => getCurrentShift(shifts, timeNow), [shifts, timeNow]);
    const hasNoRoles = !userLoading && user !== null && !loadingKanban && (kanbanData?.checklists?.length ?? 0) === 0 && !loadingUserRoles && userRolesData.length === 0;

    const currentMinutes = useMemo(() => {
        if (!timeNow) return 0;
        const [h, m] = timeNow.split(':').map(Number);
        return h * 60 + m;
    }, [timeNow]);

    const unitsList = useMemo(() => {
        if (!isGlobal || !kanbanData?.units_by_id) return [];
        return Object.values(kanbanData.units_by_id).sort((a, b) => a.name.localeCompare(b.name));
    }, [isGlobal, kanbanData?.units_by_id]);

    const [activeUnitId, setActiveUnitId] = useState<string>('all');

    const getUnitName = useCallback((cl: KanbanChecklist): string | undefined => {
        if (!isGlobal || !kanbanData?.units_by_id || !cl.restaurant_id) return undefined;
        return kanbanData.units_by_id[cl.restaurant_id]?.name;
    }, [isGlobal, kanbanData?.units_by_id]);

    // Enriquecimento de checklists do kanban (contagens + flags).
    const enrichedChecklists = useMemo(() => {
        if (!kanbanData) return [] as Array<KanbanChecklist & {
            taskCount: number;
            progress: number;
            flaggedTasksCount: number;
            hasInProgressExecution: boolean;
            hasBlockedTask: boolean;
            isDone: boolean;
        }>;

        const { checklists, tasks, executions, assumptions } = kanbanData;
        const execMapByTaskId = new Map(executions.map(e => [e.task_id, e]));
        const assumptionByChecklistId = new Map((assumptions || []).map(a => [a.checklist_id, a]));

        return checklists.flatMap((cl) => {
            const clTasks = tasks.filter(t => t.checklist_id === cl.id);
            if (clTasks.length === 0) return [];

            const clAssumption = assumptionByChecklistId.get(cl.id);
            const isCompletedByAssumption = Boolean(clAssumption?.completed_at);

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
            const blockedTasksCount = clTasks.filter(t => {
                const exec = execMapByTaskId.get(t.id);
                return exec && exec.status === 'blocked';
            }).length;

            const progress = isCompletedByAssumption
                ? 100
                : Math.round((doneTasksCount / clTasks.length) * 100);
            const hasInProgressExecution = doneTasksCount > 0 || doingTasksCount > 0 || flaggedTasksCount > 0;
            const hasBlockedTask = blockedTasksCount > 0;
            const isDone = isCompletedByAssumption || doneTasksCount === clTasks.length;

            return [{
                ...cl,
                taskCount: clTasks.length,
                progress,
                flaggedTasksCount,
                hasInProgressExecution,
                hasBlockedTask,
                isDone,
            }];
        });
    }, [kanbanData]);

    const allRequiredDone = useMemo(() => {
        if (!kanbanData) return false;
        const requiredChecklists = kanbanData.checklists.filter(c => c.is_required);
        if (requiredChecklists.length === 0) return false;
        return requiredChecklists.every(c => {
            const assumption = (kanbanData.assumptions || []).find(a => a.checklist_id === c.id);
            if (assumption?.completed_at) return true;
            const clTasks = kanbanData.tasks.filter(t => t.checklist_id === c.id);
            if (clTasks.length === 0) return true;
            return clTasks.every(t => {
                const exec = kanbanData.executions.find(e => e.task_id === t.id);
                return exec && exec.status === 'done';
            });
        });
    }, [kanbanData]);

    // Tabs de área derivadas das atribuições REAIS do usuário (user_areas).
    const userAreas = useMemo(() => {
        if (!myAreaAssignments.length) return [];
        const seen = new Set<string>();
        const result: Array<{ id: string; name: string; allowManualReceiving: boolean }> = [];
        for (const a of myAreaAssignments) {
            const id = a.area?.id;
            const name = a.area?.name;
            if (!id || !name || seen.has(id)) continue;
            seen.add(id);
            result.push({ id, name, allowManualReceiving: a.area?.allow_manual_receiving === true });
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [myAreaAssignments]);

    const [activeAreaId, setActiveAreaIdState] = useState<string>('');
    const scopeKey = isGlobal ? 'global' : (restaurantId ?? 'none');
    const setActiveAreaId = useCallback((id: string) => {
        setActiveAreaIdState(id);
        writeStoredArea(scopeKey, id);
    }, [scopeKey]);

    const activeAreaAllowsManualReceiving = useMemo(
        () => userAreas.find((a) => a.id === activeAreaId)?.allowManualReceiving === true,
        [userAreas, activeAreaId],
    );

    const globalAreas = useMemo(() => {
        if (!isGlobal || !kanbanData) return [];
        const seen = new Map<string, { id: string; name: string; unitName?: string }>();
        for (const cl of kanbanData.checklists) {
            if (!cl.area_id || !cl.areas) continue;
            const unitName = getUnitName(cl);
            const key = cl.area_id;
            if (!seen.has(key)) {
                seen.set(key, { id: cl.areas.id, name: cl.areas.name, unitName });
            }
        }
        return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [isGlobal, kanbanData, getUnitName]);

    useEffect(() => {
        const areas = isGlobal ? globalAreas : userAreas;
        if (areas.length === 0) return;
        if (areas.some(a => a.id === activeAreaId)) return;
        const saved = readStoredArea(scopeKey);
        const next = areas.some(a => a.id === saved) ? saved : areas[0].id;
        setActiveAreaIdState(next);
    }, [isGlobal, userAreas, globalAreas, scopeKey, activeAreaId]);

    // Filtros (área + unidade).
    const matchesFilters = useCallback(<T extends { area_id?: string | null; restaurant_id?: string }>(item: T): boolean => {
        if (isGlobal && activeUnitId !== 'all' && item.restaurant_id !== activeUnitId) return false;
        if (activeAreaId && item.area_id !== activeAreaId) return false;
        return true;
    }, [isGlobal, activeUnitId, activeAreaId]);

    // Construção da lista unificada (rotinas + recebimentos).
    const operations: OperationItem[] = useMemo(() => {
        if (!kanbanData) return [];
        const out: OperationItem[] = [];

        for (const cl of enrichedChecklists) {
            if (!matchesFilters(cl)) continue;
            const assumption = kanbanData.assumptions?.find(a => a.checklist_id === cl.id);
            const isAssignedToOther = Boolean(cl.assigned_to_user_id && cl.assigned_to_user_id !== user?.id);
            const isAssignedToMe = assumption?.user_id === user?.id;

            const state: RoutineStateInfo = cl.isDone
                ? { kind: 'available', inProgress: false }
                : getRoutineState({
                    start_time: cl.start_time ?? null,
                    end_time: cl.end_time ?? null,
                    currentMinutes,
                    hasBlockedTask: cl.hasBlockedTask,
                    hasInProgressExecution: cl.hasInProgressExecution,
                });

            const isReceiving = cl.checklist_type === 'receiving';
            // Heurística: receiving com is_one_shot é "rápido" (criado ad-hoc, sem template recorrente).
            const isQuick = isReceiving && (cl as KanbanChecklist).is_one_shot === true;

            out.push({
                id: `cl:${cl.id}`,
                kind: isReceiving ? 'receiving' : 'routine',
                title: cl.name,
                state,
                start_time: cl.start_time ?? null,
                end_time: cl.end_time ?? null,
                done: cl.isDone,
                meta: {
                    area: cl.roles?.name || cl.areas?.name,
                    itemsCount: cl.taskCount,
                    progress: cl.progress,
                    flaggedCount: cl.flaggedTasksCount,
                    isRequired: cl.is_required,
                    assumptionName: assumption?.user_name,
                    isAssignedToMe,
                    isAssignedToOther,
                    unitName: getUnitName(cl),
                    supplier: (cl as KanbanChecklist).supplier_name ?? null,
                    isQuick,
                },
                onClick: () => router.push(`/turno/atividade/${cl.id}`),
            });
        }

        // Recebimentos (ReceivingExpectations) — não disponíveis em modo global ainda.
        if (!isGlobal) {
            for (const exp of receivingExpectations) {
                const cl = exp.checklist;
                if (!cl) continue;
                if (activeAreaId && cl.area_id !== activeAreaId) continue;
                if (exp.status === 'cancelled') continue;

                const isDone = exp.status === 'confirmed';
                const isOverdue = exp.status === 'overdue';

                let state: RoutineStateInfo;
                if (isDone) {
                    state = { kind: 'available', inProgress: false };
                } else if (isOverdue) {
                    state = { kind: 'late', inProgress: false };
                } else {
                    state = getRoutineState({
                        start_time: exp.expected_window_start ?? null,
                        end_time: exp.expected_window_end ?? null,
                        currentMinutes,
                        hasBlockedTask: false,
                        hasInProgressExecution: false,
                    });
                }

                out.push({
                    id: `exp:${exp.id}`,
                    kind: 'receiving',
                    title: cl.name ?? 'Recebimento',
                    state,
                    start_time: exp.expected_window_start ?? null,
                    end_time: exp.expected_window_end ?? null,
                    done: isDone,
                    meta: {
                        area: undefined,
                        itemsCount: undefined,
                        supplier: cl.supplier_name ?? null,
                        isQuick: false,
                        isReceivingOverdue: isOverdue,
                        timeLabelOverride: exp.expected_window_start && exp.expected_window_end
                            ? `Prev. ${exp.expected_window_start.slice(0, 5)}–${exp.expected_window_end.slice(0, 5)}`
                            : null,
                    },
                    onClick: () => {
                        const qs = new URLSearchParams({ expectation_id: exp.id });
                        if (cl.supplier_name) qs.set('supplier', cl.supplier_name);
                        if (exp.expected_window_start) qs.set('from', exp.expected_window_start);
                        if (exp.expected_window_end) qs.set('to', exp.expected_window_end);
                        router.push(`/turno/atividade/${cl.id}?${qs.toString()}`);
                    },
                });
            }
        }

        return out;
    }, [enrichedChecklists, kanbanData, receivingExpectations, isGlobal, activeAreaId, matchesFilters, currentMinutes, user?.id, router, getUnitName]);

    const groups = useMemo(() => groupOperations(operations), [operations]);
    const pendingCount = useMemo(
        () => operations.filter((o) => !o.done).length,
        [operations],
    );

    const filteredReceivingTemplates = useMemo(
        () => receivingTemplates.filter((t) => !activeAreaId || t.area_id === activeAreaId),
        [receivingTemplates, activeAreaId],
    );

    const handleCreateQuickReceiving = async () => {
        if (!restaurantId || !activeAreaId) return;
        setQuickError(null);
        const cleanTasks = quickTasks.map((t) => t.trim()).filter(Boolean);
        if (cleanTasks.length === 0) {
            setQuickError('Adicione pelo menos uma tarefa.');
            return;
        }
        try {
            const result = await createQuickReceiving.mutateAsync({
                restaurant_id: restaurantId,
                area_id: activeAreaId,
                supplier_name: quickSupplier.trim() || undefined,
                tasks: cleanTasks.map((title) => ({ title })),
            });
            closeReceivingPicker();
            router.push(`/turno/atividade/${result.checklist_id}/executar`);
        } catch (e) {
            setQuickError(e instanceof Error ? e.message : 'Erro ao criar recebimento.');
        }
    };

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Bom dia';
        if (h < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    const effectiveAreas = isGlobal ? globalAreas : userAreas;

    if (!scope || userLoading) {
        return (
            <div className="min-h-full bg-[#101d22] pb-4">
                <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48] px-4 py-3">
                    <div className="max-w-[640px] mx-auto w-full animate-pulse">
                        <div className="h-5 w-40 rounded bg-[#233f48] mb-1.5" />
                        <div className="h-3 w-28 rounded bg-[#233f48]" />
                    </div>
                </header>
                <main className="max-w-[640px] mx-auto w-full p-3 flex flex-col gap-2 animate-pulse">
                    <div className="h-12 bg-[#1a2c32] rounded-lg" />
                    <div className="h-14 bg-[#1a2c32] rounded-lg" />
                    <div className="h-14 bg-[#1a2c32] rounded-lg" />
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-[#101d22] pb-6">
            {/* Header compacto — saudação + status do turno + contador */}
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48]">
                <div className="max-w-[640px] mx-auto w-full px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                        <h1 className="text-white text-base sm:text-lg font-bold truncate">
                            {isGlobal
                                ? 'Meu Turno · Global'
                                : `${getGreeting()}, ${user?.name.split(' ')[0] || '...'}`}
                        </h1>
                        <span className="text-[11px] text-[#92bbc9]">
                            {isGlobal
                                ? `${unitsList.length} unidades`
                                : currentShift ? `Turno: ${currentShift.name}` : 'Fora do turno'}
                        </span>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-[#92bbc9] bg-[#1a2c32] border border-[#233f48] px-2 py-1 rounded tabular-nums">
                        {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
                    </span>
                </div>
            </header>

            <main className="max-w-[640px] mx-auto w-full px-3 sm:px-4 pt-3 flex flex-col gap-3">
                {allRequiredDone && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-400 text-base shrink-0">task_alt</span>
                        <p className="text-emerald-300 font-semibold text-xs">Todas as rotinas obrigatórias concluídas</p>
                    </div>
                )}

                {!isGlobal && hasNoRoles && (
                    <div className="bg-[#1a2c32] border border-amber-500/40 rounded-lg px-3 py-2.5 flex items-start gap-2">
                        <span className="material-symbols-outlined text-amber-400 text-base shrink-0 mt-0.5">warning</span>
                        <div>
                            <p className="text-amber-300 font-semibold text-xs">Você não tem área atribuída</p>
                            <p className="text-[#92bbc9] text-[11px] mt-0.5">Fale com seu gestor para ser adicionado a uma área.</p>
                        </div>
                    </div>
                )}

                {/* Filtros: unidade (global) + área */}
                {(isGlobal && unitsList.length > 0) || effectiveAreas.length > 1 ? (
                    <div className="flex flex-col gap-2">
                        {isGlobal && unitsList.length > 0 && (
                            <div className="flex overflow-x-auto gap-1.5 -mx-1 px-1 pb-1 scrollbar-hide snap-x">
                                <FilterPill active={activeUnitId === 'all'} onClick={() => setActiveUnitId('all')}>Todas unidades</FilterPill>
                                {unitsList.map((unit) => (
                                    <FilterPill key={unit.id} active={activeUnitId === unit.id} onClick={() => setActiveUnitId(unit.id)}>
                                        {unit.name}
                                    </FilterPill>
                                ))}
                            </div>
                        )}
                        {effectiveAreas.length > 1 && (
                            <div className="flex overflow-x-auto gap-1.5 -mx-1 px-1 pb-1 scrollbar-hide snap-x">
                                {effectiveAreas.map((area) => (
                                    <FilterPill key={area.id} active={activeAreaId === area.id} onClick={() => setActiveAreaId(area.id)}>
                                        {area.name}
                                    </FilterPill>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}

                {/* Action bar: novo recebimento */}
                {!isGlobal && activeAreaAllowsManualReceiving && (
                    <button
                        onClick={() => setShowReceivingPicker(true)}
                        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#13b6ec]/10 border border-[#13b6ec]/40 text-[#13b6ec] text-xs font-semibold hover:bg-[#13b6ec]/20 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[15px]">add</span>
                        Novo recebimento
                    </button>
                )}

                {/* Lista operacional unificada */}
                {loadingKanban ? (
                    <div className="flex flex-col gap-2 animate-pulse">
                        <div className="h-14 bg-[#1a2c32] rounded-lg" />
                        <div className="h-14 bg-[#1a2c32] rounded-lg" />
                        <div className="h-14 bg-[#1a2c32] rounded-lg" />
                    </div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-10 text-[#92bbc9] text-sm bg-[#1a2c32] rounded-lg border border-dashed border-[#233f48]">
                        {kanbanData?.checklists.length === 0
                            ? 'Nenhuma rotina ativa para você.'
                            : 'Nenhuma operação nesta área.'}
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {groups.map((group) => {
                            // Grupo "done" fica recolhível.
                            if (group.key === 'done') {
                                return (
                                    <details key={group.key} className="group">
                                        <summary className="flex items-center justify-between cursor-pointer px-3 py-2 bg-[#1a2c32] rounded-md border border-[#233f48] select-none list-none [&::-webkit-details-marker]:hidden">
                                            <div className="flex items-center gap-2 text-emerald-400">
                                                <span className="material-symbols-outlined text-[16px]">task_alt</span>
                                                <span className="text-[11px] font-bold uppercase tracking-wide">{group.label}</span>
                                                <span className="text-[10px] font-semibold text-emerald-400/80 tabular-nums">{group.items.length}</span>
                                            </div>
                                            <span className="material-symbols-outlined text-[#92bbc9] text-[18px] group-open:rotate-180 transition-transform">expand_more</span>
                                        </summary>
                                        <div className="flex flex-col gap-1.5 mt-2">
                                            {group.items.map((item) => (
                                                <DoneRow key={item.id} item={item} />
                                            ))}
                                        </div>
                                    </details>
                                );
                            }

                            return (
                                <section key={group.key} className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2 px-1">
                                        <GroupDot keyName={group.key} />
                                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#92bbc9]">{group.label}</h2>
                                        <span className="text-[10px] font-semibold text-[#5a8a99] tabular-nums">{group.items.length}</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {group.items.map((item) => {
                                            const m = item.meta as {
                                                area?: string;
                                                itemsCount?: number;
                                                progress?: number;
                                                flaggedCount?: number;
                                                isRequired?: boolean;
                                                assumptionName?: string;
                                                isAssignedToMe?: boolean;
                                                isAssignedToOther?: boolean;
                                                unitName?: string;
                                                supplier?: string | null;
                                                isQuick?: boolean;
                                                isReceivingOverdue?: boolean;
                                                timeLabelOverride?: string | null;
                                            };
                                            return (
                                                <TaskRow
                                                    key={item.id}
                                                    kind={item.kind}
                                                    title={item.title}
                                                    state={item.state}
                                                    start_time={item.start_time}
                                                    end_time={item.end_time}
                                                    timeLabelOverride={m.timeLabelOverride}
                                                    area={m.area}
                                                    itemsCount={m.itemsCount}
                                                    supplier={m.supplier}
                                                    isQuick={m.isQuick}
                                                    isReceivingOverdue={m.isReceivingOverdue}
                                                    progress={m.progress}
                                                    flaggedCount={m.flaggedCount}
                                                    isRequired={m.isRequired}
                                                    assumptionName={m.assumptionName}
                                                    isAssignedToMe={m.isAssignedToMe}
                                                    isAssignedToOther={m.isAssignedToOther}
                                                    unitName={m.unitName}
                                                    onClick={item.onClick}
                                                />
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Modal: seletor de modelo + criação de recebimento rápido */}
            {showReceivingPicker && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeReceivingPicker}>
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-5 w-full max-w-[440px] flex flex-col gap-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold text-base">
                                {receivingPickerMode === 'pick' ? 'Novo recebimento' : 'Recebimento rápido'}
                            </h3>
                            <button onClick={closeReceivingPicker} className="text-[#92bbc9] hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {receivingPickerMode === 'pick' ? (
                            <>
                                {filteredReceivingTemplates.length > 0 ? (
                                    <>
                                        <p className="text-[#92bbc9] text-xs">Selecione um modelo existente:</p>
                                        <ul className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
                                            {filteredReceivingTemplates.map((t) => (
                                                <li key={t.id}>
                                                    <button
                                                        onClick={() => {
                                                            closeReceivingPicker();
                                                            const qs = new URLSearchParams();
                                                            if (t.supplier_name) qs.set('supplier', t.supplier_name);
                                                            const search = qs.toString();
                                                            router.push(`/turno/atividade/${t.id}${search ? `?${search}` : ''}`);
                                                        }}
                                                        className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-[#101d22] border border-[#233f48] hover:border-[#325a67] text-left transition-colors"
                                                    >
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-white text-sm font-semibold truncate">{t.name}</span>
                                                            {t.supplier_name && <span className="text-[#92bbc9] text-xs truncate">{t.supplier_name}</span>}
                                                        </div>
                                                        <span className="material-symbols-outlined text-[#13b6ec] text-[20px]">play_arrow</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="flex items-center gap-3">
                                            <span className="flex-1 h-px bg-[#233f48]" />
                                            <span className="text-[#5a8a99] text-[10px] uppercase tracking-wider">ou</span>
                                            <span className="flex-1 h-px bg-[#233f48]" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col gap-2 py-2">
                                        <p className="text-white text-sm font-medium">Nenhum modelo disponível para sua área.</p>
                                        <p className="text-[#92bbc9] text-xs">Você ainda pode lançar um recebimento manual agora.</p>
                                    </div>
                                )}
                                <button
                                    onClick={() => setReceivingPickerMode('quick')}
                                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-[#13b6ec]/10 border border-[#13b6ec]/40 hover:bg-[#13b6ec]/20 text-left transition-colors"
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[#13b6ec] text-sm font-bold flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[18px]">add</span>
                                            Criar recebimento rápido
                                        </span>
                                        <span className="text-[#92bbc9] text-xs">Fornecedor não cadastrado? Lance agora.</span>
                                    </div>
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[20px]">chevron_right</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-[#92bbc9] text-xs">Registre uma entrega que chegou agora, mesmo sem modelo cadastrado.</p>
                                {quickError && (
                                    <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded-lg p-2">{quickError}</p>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">Fornecedor (opcional)</label>
                                    <input
                                        type="text"
                                        value={quickSupplier}
                                        onChange={(e) => setQuickSupplier(e.target.value)}
                                        placeholder="Ex: Hortifruti CEASA"
                                        maxLength={120}
                                        className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white placeholder-[#325a67] focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all text-sm"
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider">Tarefas ({quickTasks.length}/5)</label>
                                        {quickTasks.length < 5 && (
                                            <button
                                                onClick={() => setQuickTasks([...quickTasks, ''])}
                                                className="text-[#13b6ec] hover:text-[#10a0d0] text-xs font-bold flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">add</span>
                                                Adicionar
                                            </button>
                                        )}
                                    </div>
                                    <ul className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto">
                                        {quickTasks.map((task, index) => (
                                            <li key={index} className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={task}
                                                    onChange={(e) => {
                                                        const next = [...quickTasks];
                                                        next[index] = e.target.value;
                                                        setQuickTasks(next);
                                                    }}
                                                    placeholder={`Tarefa ${index + 1}`}
                                                    maxLength={200}
                                                    className="flex-1 bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2 text-white placeholder-[#325a67] focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all text-sm"
                                                />
                                                {quickTasks.length > 1 && (
                                                    <button
                                                        onClick={() => setQuickTasks(quickTasks.filter((_, i) => i !== index))}
                                                        className="shrink-0 p-1.5 text-[#325a67] hover:text-red-400 transition-colors"
                                                        title="Remover tarefa"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={() => setReceivingPickerMode('pick')}
                                        disabled={createQuickReceiving.isPending}
                                        className="flex-1 px-4 py-2.5 rounded-lg border border-[#233f48] text-[#92bbc9] font-bold text-sm hover:border-[#325a67] hover:text-white disabled:opacity-50 transition-colors"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={handleCreateQuickReceiving}
                                        disabled={createQuickReceiving.isPending}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-[#13b6ec] text-[#0a1215] font-bold text-sm hover:bg-[#10a0d0] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        {createQuickReceiving.isPending ? (
                                            <>
                                                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                                Criando...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                                                Criar e iniciar
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ----------------------- Sub-componentes locais -----------------------

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`snap-start whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                active
                    ? 'bg-[#13b6ec] text-[#0f1b21]'
                    : 'bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]'
            }`}
        >
            {children}
        </button>
    );
}

function GroupDot({ keyName }: { keyName: string }) {
    const colorByKey: Record<string, string> = {
        blocked: 'bg-amber-500',
        late: 'bg-red-500',
        now: 'bg-[#13b6ec]',
        scheduled: 'bg-[#92bbc9]',
        open: 'bg-[#5a8a99]',
    };
    return <span className={`w-1.5 h-1.5 rounded-full ${colorByKey[keyName] ?? 'bg-[#5a8a99]'}`} aria-hidden />;
}

function DoneRow({ item }: { item: OperationItem }) {
    const m = item.meta as { itemsCount?: number; unitName?: string; supplier?: string | null };
    return (
        <button
            type="button"
            onClick={item.onClick}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-[#1a2c32]/60 hover:bg-[#1a2c32] border border-transparent hover:border-[#233f48] transition-colors text-left"
        >
            <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-emerald-400/80 text-[15px] shrink-0">check_circle</span>
                <span className="text-white/80 text-xs sm:text-sm truncate">{item.title}</span>
                {item.kind === 'receiving' && (
                    <span className="text-[10px] text-amber-300/80 shrink-0">· Recebimento</span>
                )}
                {m.supplier && (
                    <span className="text-[10px] text-[#5a8a99] truncate shrink-0">· {m.supplier}</span>
                )}
            </div>
            <span className="text-[10px] text-[#5a8a99] tabular-nums shrink-0">
                {typeof m.itemsCount === 'number' ? `${m.itemsCount} itens` : ''}
            </span>
        </button>
    );
}
