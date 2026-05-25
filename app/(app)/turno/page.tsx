'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useSession } from '@/lib/providers/use-session';
import { useAccountSessionStore } from '@/lib/store/account-session-store';
import { useKanbanTasks, KanbanChecklist } from '@/lib/hooks/use-tasks';
import { useUserRoles } from '@/lib/hooks/use-user-roles-shifts';
import { useShifts } from '@/lib/hooks/use-shifts';
import { useMyAreas } from '@/lib/hooks/use-user-areas';
import { getCurrentShift } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { RoutineCard } from '@/components/checklists/routine-card';
import { getRoutineState } from '@/lib/utils/routine-state';
import type { Scope } from '@/lib/types/scope';
import { useReceivingExpectations, useReceivingTemplates, useCreateQuickReceiving } from '@/lib/hooks/use-receiving';

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
    // Sprint 48 — Recebimentos (não misturam com rotinas obrigatórias do turno)
    const { data: receivingExpectations = [] } = useReceivingExpectations(
        isGlobal ? undefined : restaurantId || undefined,
    );
    const { data: receivingTemplates = [] } = useReceivingTemplates(
        isGlobal ? undefined : restaurantId || undefined,
    );
    const [showReceivingPicker, setShowReceivingPicker] = useState(false);
    // Sub-modo do modal: 'pick' lista templates + CTA; 'quick' mostra o mini-form.
    const [receivingPickerMode, setReceivingPickerMode] = useState<'pick' | 'quick'>('pick');
    const [quickSupplier, setQuickSupplier] = useState('');
    const [quickTasks, setQuickTasks] = useState<string[]>(['Conferir mercadoria recebida']);
    const [quickError, setQuickError] = useState<string | null>(null);
    const createQuickReceiving = useCreateQuickReceiving();

    const closeReceivingPicker = () => {
        setShowReceivingPicker(false);
        // Atrasa o reset pra não piscar conteúdo durante a animação de fechamento.
        setTimeout(() => {
            setReceivingPickerMode('pick');
            setQuickSupplier('');
            setQuickTasks(['Conferir mercadoria recebida']);
            setQuickError(null);
        }, 150);
    };

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

    const [timeNow, setTimeNow] = useState<string>('');

    useEffect(() => {
        setTimeNow(new Date().toTimeString().slice(0, 5));
        const interval = setInterval(() => setTimeNow(new Date().toTimeString().slice(0, 5)), 60000);
        return () => clearInterval(interval);
    }, []);

    // Derived states
    const currentShift = useMemo(() => getCurrentShift(shifts, timeNow), [shifts, timeNow]);
    const hasNoRoles = !userLoading && user !== null && !loadingKanban && (kanbanData?.checklists?.length ?? 0) === 0 && !loadingUserRoles && userRolesData.length === 0;

    const currentMinutes = useMemo(() => {
        if (!timeNow) return 0;
        const [h, m] = timeNow.split(':').map(Number);
        return h * 60 + m;
    }, [timeNow]);

    // Unidades disponíveis (para filtro global)
    const unitsList = useMemo(() => {
        if (!isGlobal || !kanbanData?.units_by_id) return [];
        return Object.values(kanbanData.units_by_id).sort((a, b) => a.name.localeCompare(b.name));
    }, [isGlobal, kanbanData?.units_by_id]);

    const [activeUnitId, setActiveUnitId] = useState<string>('all');

    // Resolver nome da unidade para um checklist
    const getUnitName = (cl: KanbanChecklist): string | undefined => {
        if (!isGlobal || !kanbanData?.units_by_id || !cl.restaurant_id) return undefined;
        return kanbanData.units_by_id[cl.restaurant_id]?.name;
    };

    const { todoActivities, doingActivities, blockedActivities, doneActivities } = useMemo(() => {
        if (!kanbanData || !user) return { todoActivities: [], doingActivities: [], blockedActivities: [], doneActivities: [] };

        const { checklists, tasks, executions, assumptions } = kanbanData;
        const execMapByTaskId = new Map(executions.map(e => [e.task_id, e]));
        const assumptionByChecklistId = new Map((assumptions || []).map(a => [a.checklist_id, a]));

        type EnrichedChecklist = KanbanChecklist & {
            taskCount: number;
            progress: number;
            flaggedTasksCount: number;
            hasInProgressExecution: boolean;
            hasBlockedTask: boolean;
        };
        const todo: EnrichedChecklist[] = [];
        const doing: EnrichedChecklist[] = [];
        const blocked: EnrichedChecklist[] = [];
        const done: EnrichedChecklist[] = [];

        for (const cl of checklists) {
            const clTasks = tasks.filter(t => t.checklist_id === cl.id);
            if (clTasks.length === 0) continue;

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
            const enriched = {
                ...cl,
                taskCount: clTasks.length,
                progress,
                flaggedTasksCount,
                hasInProgressExecution,
                hasBlockedTask,
            };

            if (isCompletedByAssumption || doneTasksCount === clTasks.length) {
                done.push(enriched);
            } else if (hasBlockedTask) {
                blocked.push(enriched);
            } else if (hasInProgressExecution) {
                doing.push(enriched);
            } else {
                todo.push(enriched);
            }
        }

        return { todoActivities: todo, doingActivities: doing, blockedActivities: blocked, doneActivities: done };
    }, [kanbanData, user]);

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

    // Tabs de área derivadas das atribuições REAIS do usuário (user_areas), sem exceção de owner
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

    const [activeAreaId, setActiveAreaId] = useState<string>('');

    useEffect(() => {
        if (!isGlobal && userAreas.length > 0 && !userAreas.some(a => a.id === activeAreaId)) {
            setActiveAreaId(userAreas[0].id);
        }
    }, [userAreas, activeAreaId, isGlobal]);

    // Flag da área ativa: controla a visibilidade do botão "Novo recebimento".
    // Gate por flag, NÃO por presença de templates — modal interno trata lista vazia.
    const activeAreaAllowsManualReceiving = useMemo(
        () => userAreas.find((a) => a.id === activeAreaId)?.allowManualReceiving === true,
        [userAreas, activeAreaId],
    );

    // Em global: áreas derivadas dos checklists retornados (não do user_areas)
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
    }, [isGlobal, kanbanData]);

    useEffect(() => {
        if (isGlobal && globalAreas.length > 0 && !globalAreas.some(a => a.id === activeAreaId)) {
            setActiveAreaId(globalAreas[0].id);
        }
    }, [isGlobal, globalAreas, activeAreaId]);

    // Filtro por área + unidade
    const getFiltered = <T extends { area_id?: string; restaurant_id?: string }>(activities: T[]): T[] => {
        let filtered = activities;
        // Filtro por unidade (global)
        if (isGlobal && activeUnitId !== 'all') {
            filtered = filtered.filter(a => a.restaurant_id === activeUnitId);
        }
        // Filtro por área
        if (activeAreaId) {
            filtered = filtered.filter(a => a.area_id === activeAreaId);
        }
        return filtered;
    };

    const filteredTodo = useMemo(() => getFiltered(todoActivities), [todoActivities, activeAreaId, activeUnitId, isGlobal]);
    const filteredDoing = useMemo(() => getFiltered(doingActivities), [doingActivities, activeAreaId, activeUnitId, isGlobal]);
    const filteredBlocked = useMemo(() => getFiltered(blockedActivities), [blockedActivities, activeAreaId, activeUnitId, isGlobal]);
    const filteredDone = useMemo(() => getFiltered(doneActivities), [doneActivities, activeAreaId, activeUnitId, isGlobal]);

    // Recebimentos: aplica o mesmo filtro de aba (activeAreaId) que as rotinas.
    // area_id vive aninhado em checklist.area_id nas expectations e direto nos templates.
    const filteredReceivingExpectations = useMemo(
        () => receivingExpectations.filter((e) => !activeAreaId || e.checklist?.area_id === activeAreaId),
        [receivingExpectations, activeAreaId],
    );
    const filteredReceivingTemplates = useMemo(
        () => receivingTemplates.filter((t) => !activeAreaId || t.area_id === activeAreaId),
        [receivingTemplates, activeAreaId],
    );

    // UI Helpers
    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Bom dia';
        if (h < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    const effectiveAreas = isGlobal ? globalAreas : userAreas;

    // Guard: aguardar dados essenciais antes de renderizar
    if (!scope || userLoading) {
        return (
            <div className="min-h-full bg-[#101d22] font-sans pb-20">
                <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48] px-4 py-4 md:px-8">
                    <div className="max-w-[480px] mx-auto w-full animate-pulse">
                        <div className="h-7 w-48 rounded bg-[#233f48] mb-2" />
                        <div className="h-4 w-32 rounded bg-[#233f48]" />
                    </div>
                </header>
                <main className="max-w-[480px] mx-auto w-full p-4 flex flex-col gap-3 animate-pulse">
                    <div className="h-10 bg-[#1a2c32] rounded-lg w-full mb-4" />
                    <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                    <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-[#101d22] font-sans pb-20">
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48] px-4 py-4 md:px-8">
                <div className="max-w-[480px] mx-auto w-full flex flex-col gap-2">
                    <h1 className="text-white text-xl md:text-2xl font-black">
                        {isGlobal
                            ? 'Meu Turno — Visão Global'
                            : `${getGreeting()}, ${user?.name.split(' ')[0] || '...'}`}
                    </h1>
                    <div className="flex justify-between items-center text-sm font-medium">
                        <span className="text-[#13b6ec]">
                            {isGlobal
                                ? `${unitsList.length} unidades`
                                : currentShift ? `Turno: ${currentShift.name}` : 'Fora do horário de turno'}
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

                {!isGlobal && hasNoRoles && (
                    <div className="bg-[#1a2c32] border border-amber-500/40 rounded-xl p-4 flex items-start gap-3">
                        <span className="material-symbols-outlined text-amber-400 text-xl shrink-0 mt-0.5">warning</span>
                        <div>
                            <p className="text-amber-300 font-bold text-sm">Você não tem área atribuída</p>
                            <p className="text-[#92bbc9] text-xs mt-0.5">Fale com seu gestor para ser adicionado a uma área.</p>
                        </div>
                    </div>
                )}

                {/* Sprint 48 — Recebimentos. Separado das rotinas obrigatórias do turno.
                    Aparece se há expectativas confirmadas/overdue OU templates disponíveis para iniciar manualmente. */}
                {!isGlobal && (filteredReceivingExpectations.length > 0 || activeAreaAllowsManualReceiving) && (
                    <section className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-amber-400 text-base">📦</span>
                                <h2 className="text-white font-bold text-sm">Recebimentos</h2>
                            </div>
                            {activeAreaAllowsManualReceiving && (
                                <button
                                    onClick={() => setShowReceivingPicker(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#13b6ec]/10 border border-[#13b6ec]/40 text-[#13b6ec] text-xs font-bold hover:bg-[#13b6ec]/20 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    Novo recebimento
                                </button>
                            )}
                        </div>

                        {filteredReceivingExpectations.length === 0 ? (
                            <p className="text-[#92bbc9] text-xs">Sem recebimentos previstos para hoje. Use &ldquo;Novo recebimento&rdquo; quando uma mercadoria chegar.</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {filteredReceivingExpectations.map((exp) => {
                                    const cl = exp.checklist;
                                    const isOverdue = exp.status === 'overdue';
                                    return (
                                        <li key={exp.id}>
                                            <button
                                                onClick={() => {
                                                    if (!cl) return;
                                                    // Vai para a tela de preview existente. Querystring carrega
                                                    // contexto da expectação (id liga assumption → expectation no
                                                    // backend; supplier/from/to são metadata visual).
                                                    const qs = new URLSearchParams({ expectation_id: exp.id });
                                                    if (cl.supplier_name) qs.set('supplier', cl.supplier_name);
                                                    if (exp.expected_window_start) qs.set('from', exp.expected_window_start);
                                                    if (exp.expected_window_end) qs.set('to', exp.expected_window_end);
                                                    router.push(`/turno/atividade/${cl.id}?${qs.toString()}`);
                                                }}
                                                className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors disabled:opacity-60 ${
                                                    isOverdue
                                                        ? 'bg-amber-500/5 border-amber-500/40 hover:bg-amber-500/10'
                                                        : 'bg-[#101d22] border-[#233f48] hover:border-[#325a67]'
                                                }`}
                                            >
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-white text-sm font-semibold truncate">{cl?.name ?? 'Recebimento'}</span>
                                                    <span className="text-[#92bbc9] text-xs truncate">
                                                        {cl?.supplier_name || 'Fornecedor não informado'}
                                                        {exp.expected_window_start && exp.expected_window_end && (
                                                            <span className="ml-2">• Previsão: {exp.expected_window_start.slice(0,5)}–{exp.expected_window_end.slice(0,5)}</span>
                                                        )}
                                                    </span>
                                                </div>
                                                {isOverdue ? (
                                                    /* Janela é previsão logística, não SLA. Label suave para o
                                                       staff; status='overdue' permanece no DB para cron/notif. */
                                                    <span className="shrink-0 text-amber-400 text-[10px] font-bold uppercase tracking-wider">Previsão passou</span>
                                                ) : (
                                                    <span className="material-symbols-outlined text-[#92bbc9] text-[20px]">chevron_right</span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                )}

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

                {loadingKanban ? (
                    <div className="flex flex-col gap-3 animate-pulse">
                        <div className="h-10 bg-[#1a2c32] rounded-lg w-full mb-4" />
                        <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                        <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">

                        {/* Filtro por unidade (global) */}
                        {isGlobal && unitsList.length > 0 && (
                            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide snap-x">
                                <button
                                    onClick={() => setActiveUnitId('all')}
                                    className={`
                                        snap-start whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-semibold transition-colors
                                        ${activeUnitId === 'all'
                                            ? 'bg-[#13b6ec] text-[#0f1b21]'
                                            : 'bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]'
                                        }
                                    `}
                                    style={{ minHeight: '40px' }}
                                >
                                    Todas as Unidades
                                </button>
                                {unitsList.map((unit) => (
                                    <button
                                        key={unit.id}
                                        onClick={() => setActiveUnitId(unit.id)}
                                        className={`
                                            snap-start whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-semibold transition-colors
                                            ${activeUnitId === unit.id
                                                ? 'bg-[#13b6ec] text-[#0f1b21]'
                                                : 'bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]'
                                            }
                                        `}
                                        style={{ minHeight: '40px' }}
                                    >
                                        {unit.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Filtro por área */}
                        {effectiveAreas.length > 1 && (
                            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide snap-x">
                                {effectiveAreas.map((area) => (
                                    <button
                                        key={area.id}
                                        onClick={() => setActiveAreaId(area.id)}
                                        className={`
                                            snap-start whitespace-nowrap px-6 py-3 rounded-full text-sm font-semibold transition-colors
                                            ${activeAreaId === area.id
                                                ? 'bg-[#00c6d2] text-[#0f1b21]'
                                                : 'bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]'
                                            }
                                        `}
                                        style={{ minHeight: '44px' }}
                                    >
                                        {area.name}
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
                                    {kanbanData?.checklists.length === 0 ? "Nenhuma rotina ativa para você" : "Todas as rotinas desta área iniciadas!"}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {filteredTodo.map(activity => {
                                        const isAssignedToOther = Boolean(activity.assigned_to_user_id && activity.assigned_to_user_id !== user?.id);
                                        const assumption = kanbanData?.assumptions?.find(a => a.checklist_id === activity.id);
                                        const state = getRoutineState({
                                            start_time: activity.start_time ?? null,
                                            end_time: activity.end_time ?? null,
                                            currentMinutes,
                                            hasBlockedTask: activity.hasBlockedTask,
                                            hasInProgressExecution: activity.hasInProgressExecution,
                                        });
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
                                                isAssignedToMe={assumption?.user_id === user?.id}
                                                assumptionName={assumption?.user_name}
                                                area={activity.roles?.name || activity.areas?.name}
                                                unitName={getUnitName(activity)}
                                                state={state}
                                                onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* COM IMPEDIMENTO */}
                        {filteredBlocked.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">block</span>
                                    <h2 className="text-amber-400 font-bold tracking-wide uppercase text-sm">Com Impedimento</h2>
                                    <span className="ml-auto bg-amber-400/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">{filteredBlocked.length}</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {filteredBlocked.map(activity => {
                                        const assumption = kanbanData?.assumptions?.find(a => a.checklist_id === activity.id);
                                        const state = getRoutineState({
                                            start_time: activity.start_time ?? null,
                                            end_time: activity.end_time ?? null,
                                            currentMinutes,
                                            hasBlockedTask: activity.hasBlockedTask,
                                            hasInProgressExecution: activity.hasInProgressExecution,
                                        });
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
                                                isAssignedToMe={assumption?.user_id === user?.id}
                                                assumptionName={assumption?.user_name}
                                                area={activity.roles?.name || activity.areas?.name}
                                                unitName={getUnitName(activity)}
                                                state={state}
                                                onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                            />
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* EM EXECUÇÃO */}
                        {filteredDoing.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#13b6ec]">play_circle</span>
                                    <h2 className="text-[#13b6ec] font-bold tracking-wide uppercase text-sm">Em Execução</h2>
                                    <span className="ml-auto bg-[#13b6ec]/20 text-[#13b6ec] text-xs px-2 py-0.5 rounded-full">{filteredDoing.length}</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {filteredDoing.map(activity => {
                                        const assumption = kanbanData?.assumptions?.find(a => a.checklist_id === activity.id);
                                        const state = getRoutineState({
                                            start_time: activity.start_time ?? null,
                                            end_time: activity.end_time ?? null,
                                            currentMinutes,
                                            hasBlockedTask: activity.hasBlockedTask,
                                            hasInProgressExecution: activity.hasInProgressExecution,
                                        });
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
                                                isAssignedToMe={assumption?.user_id === user?.id}
                                                assumptionName={assumption?.user_name}
                                                area={activity.roles?.name || activity.areas?.name}
                                                unitName={getUnitName(activity)}
                                                state={state}
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
                                    const unitName = getUnitName(activity);

                                    return (
                                        <div key={activity.id}
                                            onClick={() => router.push(`/turno/atividade/${activity.id}`)}
                                            className="flex justify-between items-center cursor-pointer hover:bg-[#1a2c32]/70 bg-[#1a2c32]/50 rounded-lg p-3 transition-colors border border-transparent hover:border-[#233f48]">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-400/80 text-sm">check_circle</span>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-white/80 text-sm">{activity.name}</span>
                                                    {unitName && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#13b6ec]/10 text-[#13b6ec] border border-[#13b6ec]/30 w-fit">
                                                            <span className="material-symbols-outlined text-[12px]">storefront</span>
                                                            {unitName}
                                                        </span>
                                                    )}
                                                </div>
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
