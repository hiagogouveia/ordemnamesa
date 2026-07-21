'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/providers/use-session';
import { useAccountSessionStore } from '@/lib/store/account-session-store';
import { useKanbanTasks, KanbanChecklist } from '@/lib/hooks/use-tasks';
import { useShifts } from '@/lib/hooks/use-shifts';
import { useRestaurantNow } from '@/lib/hooks/use-restaurant-now';
import { useMyAreas } from '@/lib/hooks/use-user-areas';
import { useUserShifts } from '@/lib/hooks/use-user-roles-shifts';
import { pickMyShiftForHeader } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getRoutineState, type RoutineStateInfo } from '@/lib/utils/routine-state';
import type { Scope } from '@/lib/types/scope';
import { useReceivingTemplatesAvailableMeta } from '@/lib/hooks/use-receiving-templates';
import { useInstantiateReceiving } from '@/lib/hooks/use-receiving-instantiate';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
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

    const { data: kanbanData, isLoading: loadingKanban } = useKanbanTasks(scope, userId ?? undefined);
    const { data: shifts = [] } = useShifts(restaurantId || undefined);
    // Turnos vinculados ao usuário (fonte da verdade do cabeçalho). Em modo
    // global (gestão) não há vínculo por unidade → não consultar.
    const { data: myShiftAssignments = [] } = useUserShifts(
        isGlobal ? undefined : (restaurantId || undefined),
        userId ?? undefined,
    );
    const { data: myAreaAssignments = [], isLoading: loadingMyAreas } = useMyAreas(restaurantId || undefined, userId ?? undefined);
    const { data: availableMeta } = useReceivingTemplatesAvailableMeta(
        isGlobal ? undefined : restaurantId || undefined,
    );
    const availableTemplates = availableMeta?.available ?? [];
    const totalTemplatesInScope = availableMeta?.total_in_scope ?? 0;
    const { data: suppliers = [] } = useSuppliers(
        isGlobal ? undefined : restaurantId || undefined,
    );
    const instantiateReceiving = useInstantiateReceiving();

    // Modal de novo recebimento: 2 etapas — escolher modelo → escolher/cadastrar fornecedor.
    const [showReceivingPicker, setShowReceivingPicker] = useState(false);
    const [pickerStep, setPickerStep] = useState<'template' | 'supplier'>('template');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [supplierMode, setSupplierMode] = useState<'pick' | 'new'>('pick');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierCnpj, setNewSupplierCnpj] = useState('');
    const [pickerError, setPickerError] = useState<string | null>(null);
    // Idempotency key estável durante todo o ciclo do modal — regenerado a cada
    // nova abertura para evitar dedup acidental entre intenções distintas.
    const [idempotencyKey, setIdempotencyKey] = useState<string>('');

    useEffect(() => {
        if (showReceivingPicker && !idempotencyKey) {
            setIdempotencyKey(typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        }
    }, [showReceivingPicker, idempotencyKey]);

    const closeReceivingPicker = () => {
        setShowReceivingPicker(false);
        setTimeout(() => {
            setPickerStep('template');
            setSelectedTemplateId(null);
            setSupplierMode('pick');
            setSelectedSupplierId('');
            setNewSupplierName('');
            setNewSupplierCnpj('');
            setPickerError(null);
            setIdempotencyKey('');
        }, 150);
    };

    // Sprint 73 — "agora" no fuso do restaurante (não no relógio do navegador).
    const { timeHHMM: timeNow, currentMinutes } = useRestaurantNow();

    // Cabeçalho baseado no VÍNCULO user↔shifts (não no relógio). Resolve os
    // turnos do usuário a partir das atribuições + lista de turnos do restaurante.
    const myShifts = useMemo(
        () => myShiftAssignments
            .map((a) => shifts.find((s) => s.id === a.shift_id))
            .filter((s): s is NonNullable<typeof s> => Boolean(s)),
        [myShiftAssignments, shifts],
    );
    const headerShift = useMemo(
        () => (timeNow ? pickMyShiftForHeader(myShifts, timeNow) : null),
        [myShifts, timeNow],
    );
    const hasNoAreaAssigned = !userLoading && user !== null && !isGlobal && !loadingMyAreas && myAreaAssignments.length === 0;

    const unitsList = useMemo(() => {
        if (!isGlobal || !kanbanData?.units_by_id) return [];
        return Object.values(kanbanData.units_by_id).sort((a, b) => a.name.localeCompare(b.name));
    }, [isGlobal, kanbanData?.units_by_id]);

    const [activeUnitId, setActiveUnitId] = useState<string>('all');
    // Filtro por tipo de operacao. "Rapido" nao e tab propria — recebimento ad-hoc
    // entra como subtipo dentro de "Recebimentos" (badge no TaskRow).
    const [activeTypeFilter, setActiveTypeFilter] = useState<'all' | 'routine' | 'receiving' | 'done'>('all');

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
        const result: Array<{ id: string; name: string }> = [];
        for (const a of myAreaAssignments) {
            const id = a.area?.id;
            const name = a.area?.name;
            if (!id || !name || seen.has(id)) continue;
            seen.add(id);
            result.push({ id, name });
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [myAreaAssignments]);

    const [activeAreaId, setActiveAreaIdState] = useState<string>('');
    const scopeKey = isGlobal ? 'global' : (restaurantId ?? 'none');
    const setActiveAreaId = useCallback((id: string) => {
        setActiveAreaIdState(id);
        writeStoredArea(scopeKey, id);
    }, [scopeKey]);

    const globalAreas = useMemo(() => {
        if (!isGlobal || !kanbanData) return [];
        const seen = new Map<string, { id: string; name: string; unitName?: string }>();
        for (const cl of kanbanData.checklists) {
            const unitName = getUnitName(cl);
            // s92: a rotina pode ter várias áreas — cada uma vira uma aba.
            const ids = cl.area_ids?.length ? cl.area_ids : (cl.area_id ? [cl.area_id] : []);
            for (const id of ids) {
                if (seen.has(id)) continue;
                const name = cl.areas_list?.find((a) => a.id === id)?.name
                    ?? (id === cl.area_id ? cl.areas?.name : undefined);
                if (!name) continue;
                seen.set(id, { id, name, unitName });
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
    // s92: a rotina pertence a 1..N áreas — a aba casa por INTERSEÇÃO, então uma
    // rotina multi-área aparece na aba de cada uma das suas áreas.
    const matchesFilters = useCallback(<T extends { area_id?: string | null; area_ids?: string[]; restaurant_id?: string }>(item: T): boolean => {
        if (isGlobal && activeUnitId !== 'all' && item.restaurant_id !== activeUnitId) return false;
        if (activeAreaId) {
            const ids = item.area_ids?.length ? item.area_ids : (item.area_id ? [item.area_id] : []);
            if (!ids.includes(activeAreaId)) return false;
        }
        return true;
    }, [isGlobal, activeUnitId, activeAreaId]);

    // Lookup de fornecedor por id — usado para enriquecer cards de recebimento.
    const supplierById = useMemo(() => {
        const map = new Map<string, string>();
        for (const s of suppliers) map.set(s.id, s.name);
        return map;
    }, [suppliers]);

    // Construção da lista unificada de operações.
    // Etapa 3 do refator: receivings deixam de vir de ReceivingExpectation —
    // execuções (instantiate) entram naturalmente pelo kanban como qualquer
    // checklist normal (is_one_shot=true, checklist_type='receiving',
    // source_template_id apontando para o modelo).
    const operations: OperationItem[] = useMemo(() => {
        if (!kanbanData) return [];
        const out: OperationItem[] = [];

        for (const cl of enrichedChecklists) {
            if (!matchesFilters(cl)) continue;

            const assumption = kanbanData.assumptions?.find(a => a.checklist_id === cl.id);
            const isAssignedToOther = Boolean(cl.assigned_to_user_id && cl.assigned_to_user_id !== user?.id);
            const isAssignedToMe = assumption?.user_id === user?.id;
            // Atribuição exclusiva ao usuário logado (não é "assumiu", é atribuição direta).
            const isExclusivelyMine = Boolean(cl.assigned_to_user_id && cl.assigned_to_user_id === user?.id);

            const state: RoutineStateInfo = cl.isDone
                ? { kind: 'available', inProgress: false }
                : getRoutineState({
                    start_time: cl.start_time ?? null,
                    end_time: cl.end_time ?? null,
                    currentMinutes,
                    hasBlockedTask: cl.hasBlockedTask,
                    hasInProgressExecution: cl.hasInProgressExecution,
                    allow_early_start: cl.allow_early_start ?? false,
                });

            const isReceiving = cl.checklist_type === 'receiving';
            const isQuick = isReceiving && cl.is_one_shot === true;

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
                    areas: cl.areas_list?.map((a) => a.name),
                    itemsCount: cl.taskCount,
                    progress: cl.progress,
                    flaggedCount: cl.flaggedTasksCount,
                    isRequired: cl.is_required,
                    assumptionName: assumption?.user_name,
                    isAssignedToMe,
                    isAssignedToOther,
                    exclusivelyAssignedToMe: isExclusivelyMine,
                    unitName: getUnitName(cl),
                    supplier: cl.supplier_id ? (supplierById.get(cl.supplier_id) ?? null) : null,
                    isQuick,
                    hasInProgressExecution: cl.hasInProgressExecution,
                },
                onClick: () => router.push(`/turno/atividade/${cl.id}`),
            });
        }

        return out;
    }, [enrichedChecklists, kanbanData, matchesFilters, currentMinutes, user?.id, router, getUnitName, supplierById]);

    // Separação: "Executando" (in_progress, não concluído) vs lista principal vs done.
    const isInProgress = (o: OperationItem): boolean => {
        if (o.done) return false;
        const m = o.meta as { hasInProgressExecution?: boolean; assumptionName?: string };
        return m.hasInProgressExecution === true || Boolean(m.assumptionName);
    };

    const inProgressOperations = useMemo(
        () => operations.filter((o) => isInProgress(o)),
        [operations],
    );

    const pendingOperations = useMemo(
        () => operations.filter((o) => !o.done && !isInProgress(o)),
        [operations],
    );

    const doneOperations = useMemo(() => operations.filter((o) => o.done), [operations]);

    // Contagens por tipo — modelos NÃO contam (não estão em `operations`, são
    // entidade separada em receiving_templates). Apenas execuções contam.
    const typeCounts = useMemo(() => {
        let all = 0, routine = 0, receiving = 0;
        for (const o of pendingOperations.concat(inProgressOperations)) {
            all++;
            const isQuick = o.meta?.isQuick === true;
            if (o.kind === 'routine' || isQuick) routine++;
            if (o.kind === 'receiving') receiving++;
        }
        return { all, routine, receiving, done: doneOperations.length };
    }, [pendingOperations, inProgressOperations, doneOperations]);

    const filteredOperations = useMemo(() => {
        if (activeTypeFilter === 'done') return doneOperations;
        // Lista principal mostra apenas pendentes (in_progress vão pro bloco "Executando").
        const base = pendingOperations;
        if (activeTypeFilter === 'all') return base;
        return base.filter((o) => {
            const isQuick = o.meta?.isQuick === true;
            if (activeTypeFilter === 'routine') return o.kind === 'routine' || isQuick;
            if (activeTypeFilter === 'receiving') return o.kind === 'receiving';
            return true;
        });
    }, [pendingOperations, doneOperations, activeTypeFilter]);

    const groups = useMemo(() => groupOperations(filteredOperations), [filteredOperations]);
    const doneCount = doneOperations.length;
    const totalCount = operations.length;
    const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    // Visibilidade do botão "+ Novo Recebimento": só aparece se houver modelos
    // disponíveis hoje no contexto do usuário (área/role/usuário). Filtra por
    // área ativa quando aplicável.
    const visibleTemplates = useMemo(
        () => availableTemplates.filter((t) => {
            if (!activeAreaId) return true;
            const ids = t.area_ids?.length ? t.area_ids : (t.area_id ? [t.area_id] : []);
            return ids.includes(activeAreaId);
        }),
        [availableTemplates, activeAreaId],
    );
    // s60: 3 estados do botão "Novo recebimento"
    //   C) há template disponível agora → botão habilitado
    //   B) há template cadastrado no escopo mas nenhum previsto hoje → botão desabilitado + msg
    //   A) zero templates cadastrados no escopo do user → botão desabilitado + msg distinta
    // Em modo global (multi-restaurante) o botão segue oculto.
    type NewReceivingState =
        | { mode: 'hidden' }
        | { mode: 'enabled' }
        | { mode: 'disabled'; reason: 'none-today' | 'none-registered' };
    const newReceivingState: NewReceivingState = useMemo(() => {
        if (isGlobal) return { mode: 'hidden' };
        if (visibleTemplates.length > 0) return { mode: 'enabled' };
        if (totalTemplatesInScope > 0) return { mode: 'disabled', reason: 'none-today' };
        return { mode: 'disabled', reason: 'none-registered' };
    }, [isGlobal, visibleTemplates.length, totalTemplatesInScope]);

    const handleInstantiate = async () => {
        if (!restaurantId || !selectedTemplateId || !idempotencyKey) return;
        setPickerError(null);

        try {
            let supplierPayload: { supplier_id?: string; supplier_new?: { name: string; cnpj?: string } } = {};
            if (supplierMode === 'pick') {
                if (!selectedSupplierId) {
                    setPickerError('Selecione um fornecedor.');
                    return;
                }
                supplierPayload = { supplier_id: selectedSupplierId };
            } else {
                const name = newSupplierName.trim();
                if (!name) {
                    setPickerError('Informe o nome do fornecedor.');
                    return;
                }
                const cnpj = newSupplierCnpj.trim().replace(/\D/g, '');
                if (cnpj && cnpj.length !== 14) {
                    setPickerError('CNPJ deve ter 14 dígitos.');
                    return;
                }
                supplierPayload = { supplier_new: { name, ...(cnpj ? { cnpj } : {}) } };
            }

            const result = await instantiateReceiving.mutateAsync({
                restaurant_id: restaurantId,
                template_id: selectedTemplateId,
                idempotency_key: idempotencyKey,
                ...supplierPayload,
            });
            closeReceivingPicker();
            router.push(`/turno/atividade/${result.checklist_id}/executar`);
        } catch (e) {
            const err = e as Error & { code?: string };
            if (err.code === 'TEMPLATE_NOT_AVAILABLE') {
                setPickerError('Modelo não está mais disponível. Atualize a lista.');
            } else {
                setPickerError(err.message || 'Erro ao iniciar recebimento.');
            }
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
            {/* Header — saudação + meta do turno + anel de progresso */}
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48]">
                <div className="max-w-[640px] mx-auto w-full px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-white text-xl sm:text-2xl font-bold leading-tight tracking-tight truncate">
                            {isGlobal
                                ? 'Meu Turno · Global'
                                : `${getGreeting()}, ${user?.name.split(' ')[0] || '...'}.`}
                        </h1>
                        <div className="mt-1 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[#92bbc9] font-medium uppercase tracking-wider flex-wrap">
                                {isGlobal ? (
                                    <span className="text-[#13b6ec]">{unitsList.length} unidades</span>
                                ) : headerShift ? (
                                    <>
                                        <span className="text-[#13b6ec]">Turno {headerShift.shift.name}</span>
                                        {headerShift.shift.start_time && headerShift.shift.end_time && (
                                            <>
                                                <span className="text-[#325a67]">·</span>
                                                <span className="tabular-nums">{headerShift.shift.start_time.slice(0,5)} – {headerShift.shift.end_time.slice(0,5)}</span>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <span>Todos os turnos</span>
                                )}
                            </div>
                            {/* Aviso operacional não-bloqueante: fora do horário do turno. */}
                            {!isGlobal && headerShift && !headerShift.isActiveNow && headerShift.shift.start_time && (
                                <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-amber-400 font-medium normal-case tracking-normal">
                                    <span className="material-symbols-outlined text-[13px]">schedule</span>
                                    Você está fora do horário do seu turno — inicia às {headerShift.shift.start_time.slice(0,5)}.
                                </span>
                            )}
                        </div>
                    </div>
                    {totalCount > 0 && (
                        <ProgressRing pct={progressPct} done={doneCount} total={totalCount} />
                    )}
                </div>
            </header>

            <main className="max-w-[640px] mx-auto w-full px-3 sm:px-4 pt-3 flex flex-col gap-3">
                {allRequiredDone && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-400 text-base shrink-0">task_alt</span>
                        <p className="text-emerald-300 font-semibold text-xs">Todas as rotinas obrigatórias concluídas</p>
                    </div>
                )}

                {hasNoAreaAssigned && (
                    <div className="bg-[#1a2c32] border border-amber-500/40 rounded-lg px-3 py-2.5 flex items-start gap-2">
                        <span className="material-symbols-outlined text-amber-400 text-base shrink-0 mt-0.5">warning</span>
                        <div>
                            <p className="text-amber-300 font-semibold text-xs">Você não tem área atribuída</p>
                            <p className="text-[#92bbc9] text-[11px] mt-0.5">Fale com seu gestor para ser adicionado a uma área.</p>
                        </div>
                    </div>
                )}

                {/* Tabs de tipo: Todas / Rotinas / Recebimentos / Concluídas. */}
                <div className="flex overflow-x-auto gap-1.5 -mx-1 px-1 pb-1 scrollbar-hide snap-x">
                    <TypeChip active={activeTypeFilter === 'all'} onClick={() => setActiveTypeFilter('all')} count={typeCounts.all}>
                        Todas
                    </TypeChip>
                    <TypeChip active={activeTypeFilter === 'routine'} onClick={() => setActiveTypeFilter('routine')} count={typeCounts.routine} icon="checklist">
                        Rotinas
                    </TypeChip>
                    <TypeChip active={activeTypeFilter === 'receiving'} onClick={() => setActiveTypeFilter('receiving')} count={typeCounts.receiving} icon="local_shipping">
                        Recebimentos
                    </TypeChip>
                    <TypeChip active={activeTypeFilter === 'done'} onClick={() => setActiveTypeFilter('done')} count={typeCounts.done} icon="task_alt">
                        Concluídas
                    </TypeChip>
                </div>

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

                {/* Action bar: novo recebimento — 3 estados (s60).
                    - enabled: botão funcional
                    - disabled none-today: templates cadastrados mas nenhum previsto hoje
                    - disabled none-registered: nenhum modelo cadastrado na área
                    Em ambos casos disabled o botão permanece visível com mensagem curta. */}
                {newReceivingState.mode === 'enabled' && (
                    <button
                        onClick={() => setShowReceivingPicker(true)}
                        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#13b6ec]/10 border border-[#13b6ec]/40 text-[#13b6ec] text-xs font-semibold hover:bg-[#13b6ec]/20 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[15px]">add</span>
                        Novo recebimento
                    </button>
                )}
                {newReceivingState.mode === 'disabled' && (
                    <div
                        className="self-start inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#16262c] border border-[#233f48] text-[#557682] text-xs font-semibold cursor-not-allowed"
                        title={
                            newReceivingState.reason === 'none-registered'
                                ? 'Nenhum modelo de recebimento cadastrado para esta área. Peça ao gestor para criar um modelo em Recebimentos.'
                                : 'Nenhum recebimento previsto para hoje neste turno. Verifique a recorrência dos modelos.'
                        }
                    >
                        <span className="material-symbols-outlined text-[15px] opacity-60">local_shipping</span>
                        <span className="truncate max-w-[60vw]">
                            {newReceivingState.reason === 'none-registered'
                                ? 'Nenhum modelo de recebimento cadastrado'
                                : 'Nenhum recebimento previsto para hoje'}
                        </span>
                    </div>
                )}

                {/* Bloco "Executando" — colapsável, prioridade visual no topo.
                    Mostra rotinas + recebimentos em andamento (assumption
                    in_progress, sem completed_at). */}
                {inProgressOperations.length > 0 && (
                    <ExecutandoBlock items={inProgressOperations} />
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
                            // Grupo "done" fica recolhível — aberto quando a tab "Concluídas" está ativa.
                            if (group.key === 'done') {
                                return (
                                    <details key={group.key} open={activeTypeFilter === 'done'} className="group">
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
                                                areas?: string[];
                                                itemsCount?: number;
                                                progress?: number;
                                                flaggedCount?: number;
                                                isRequired?: boolean;
                                                assumptionName?: string;
                                                isAssignedToMe?: boolean;
                                                isAssignedToOther?: boolean;
                                                exclusivelyAssignedToMe?: boolean;
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
                                                    areas={m.areas}
                                                    itemsCount={m.itemsCount}
                                                    supplier={m.supplier}
                                                    isReceivingOverdue={m.isReceivingOverdue}
                                                    progress={m.progress}
                                                    flaggedCount={m.flaggedCount}
                                                    isRequired={m.isRequired}
                                                    assumptionName={m.assumptionName}
                                                    isAssignedToMe={m.isAssignedToMe}
                                                    isAssignedToOther={m.isAssignedToOther}
                                                    exclusivelyAssignedToMe={m.exclusivelyAssignedToMe}
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

            {/* Modal: step 1 escolher modelo → step 2 escolher/cadastrar fornecedor → instantiate */}
            {showReceivingPicker && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeReceivingPicker}>
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-5 w-full max-w-[440px] flex flex-col gap-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold text-base">
                                {pickerStep === 'template' ? 'Novo recebimento' : 'Fornecedor'}
                            </h3>
                            <button onClick={closeReceivingPicker} className="text-[#92bbc9] hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {pickerStep === 'template' ? (
                            <>
                                <p className="text-[#92bbc9] text-xs">Qual modelo de recebimento chegou agora?</p>
                                <ul className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
                                    {visibleTemplates.map((t) => (
                                        <li key={t.id}>
                                            <button
                                                onClick={() => {
                                                    setSelectedTemplateId(t.id);
                                                    setPickerStep('supplier');
                                                }}
                                                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-[#101d22] border border-[#233f48] hover:border-[#325a67] text-left transition-colors"
                                            >
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-white text-sm font-semibold truncate">{t.name}</span>
                                                    <span className="text-[#92bbc9] text-xs">
                                                        {t.tasks_count} {t.tasks_count === 1 ? 'tarefa' : 'tarefas'}
                                                        {(() => {
                                                            const names = (t.areas_list?.length ? t.areas_list : (t.area ? [t.area] : [])).map((a) => a.name);
                                                            return names.length > 0 ? ` · ${names.join(', ')}` : '';
                                                        })()}
                                                    </span>
                                                </div>
                                                <span className="material-symbols-outlined text-[#13b6ec] text-[20px]">chevron_right</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <>
                                {pickerError && (
                                    <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded-lg p-2">{pickerError}</p>
                                )}

                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => setSupplierMode('pick')}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                            supplierMode === 'pick'
                                                ? 'bg-[#13b6ec] text-[#0a1215]'
                                                : 'bg-[#101d22] border border-[#233f48] text-[#92bbc9]'
                                        }`}
                                    >
                                        Escolher existente
                                    </button>
                                    <button
                                        onClick={() => setSupplierMode('new')}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                            supplierMode === 'new'
                                                ? 'bg-[#13b6ec] text-[#0a1215]'
                                                : 'bg-[#101d22] border border-[#233f48] text-[#92bbc9]'
                                        }`}
                                    >
                                        Cadastrar novo
                                    </button>
                                </div>

                                {supplierMode === 'pick' ? (
                                    suppliers.length > 0 ? (
                                        <div>
                                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">Fornecedor</label>
                                            <select
                                                value={selectedSupplierId}
                                                onChange={(e) => setSelectedSupplierId(e.target.value)}
                                                className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none"
                                            >
                                                <option value="">— Selecione —</option>
                                                {suppliers.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <p className="text-[#92bbc9] text-xs py-2">
                                            Nenhum fornecedor cadastrado. Use &ldquo;Cadastrar novo&rdquo; acima.
                                        </p>
                                    )
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">Nome</label>
                                            <input
                                                type="text"
                                                value={newSupplierName}
                                                onChange={(e) => setNewSupplierName(e.target.value)}
                                                placeholder="Ex: Hortifruti CEASA"
                                                maxLength={120}
                                                className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white placeholder-[#325a67] text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-1.5">CNPJ <span className="text-[#5a8a99] normal-case font-normal">(opcional)</span></label>
                                            <input
                                                type="text"
                                                value={newSupplierCnpj}
                                                onChange={(e) => setNewSupplierCnpj(e.target.value)}
                                                placeholder="00.000.000/0000-00"
                                                inputMode="numeric"
                                                className="w-full bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2.5 text-white placeholder-[#325a67] text-sm focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={() => { setPickerStep('template'); setPickerError(null); }}
                                        disabled={instantiateReceiving.isPending}
                                        className="flex-1 px-4 py-2.5 rounded-lg border border-[#233f48] text-[#92bbc9] font-bold text-sm hover:border-[#325a67] hover:text-white disabled:opacity-50 transition-colors"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={handleInstantiate}
                                        disabled={instantiateReceiving.isPending}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-[#13b6ec] text-[#0a1215] font-bold text-sm hover:bg-[#10a0d0] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        {instantiateReceiving.isPending ? (
                                            <>
                                                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                                Iniciando…
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                                                Iniciar
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

function TypeChip({ active, onClick, count, icon, children }: {
    active: boolean;
    onClick: () => void;
    count: number;
    icon?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`snap-start whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                active
                    ? 'bg-[#1a2c32] text-[#13b6ec] border border-[#325a67]'
                    : 'bg-transparent text-[#92bbc9] border border-transparent hover:text-white'
            }`}
        >
            {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
            {children}
            <span className={`text-[10px] font-bold tabular-nums px-1.5 py-px rounded-full ${
                active ? 'bg-[#13b6ec]/20 text-[#13b6ec]' : 'bg-[#1a2c32] text-[#92bbc9]'
            }`}>
                {count}
            </span>
        </button>
    );
}

function ProgressRing({ pct, done, total }: { pct: number; done: number; total: number }) {
    const r = 16;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - pct / 100);
    return (
        <div className="shrink-0 flex items-center gap-2.5 bg-[#1a2c32] border border-[#233f48] rounded-xl px-3 py-2">
            <div className="relative w-10 h-10 flex items-center justify-center">
                <svg width="40" height="40" className="-rotate-90">
                    <circle cx="20" cy="20" r={r} fill="none" stroke="#233f48" strokeWidth="3.5" />
                    <circle
                        cx="20" cy="20" r={r}
                        fill="none"
                        stroke="#13b6ec"
                        strokeWidth="3.5"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className="transition-[stroke-dashoffset] duration-500"
                    />
                </svg>
                <span className="absolute text-[9px] font-bold text-[#13b6ec] tabular-nums">{pct}%</span>
            </div>
            <div className="leading-tight">
                <div className="text-white font-bold text-base tabular-nums">
                    {done}<span className="text-[#5a8a99] text-xs">/{total}</span>
                </div>
                <div className="text-[9px] text-[#92bbc9] uppercase tracking-wider font-semibold">Concluídas</div>
            </div>
        </div>
    );
}

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

function ExecutandoBlock({ items }: { items: OperationItem[] }) {
    // Default aberto até 3 itens; recolhido a partir disso para preservar mobile.
    const defaultOpen = items.length <= 3;
    return (
        <details open={defaultOpen} className="group bg-[#13b6ec]/10 border border-[#13b6ec]/40 rounded-lg">
            <summary className="flex items-center justify-between cursor-pointer px-3 py-2 select-none list-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2 text-[#13b6ec]">
                    <span className="material-symbols-outlined text-[16px] animate-pulse">play_circle</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide">Executando</span>
                    <span className="text-[10px] font-semibold tabular-nums bg-[#13b6ec]/20 px-1.5 py-px rounded-full">{items.length}</span>
                </div>
                <span className="material-symbols-outlined text-[#13b6ec] text-[18px] group-open:rotate-180 transition-transform">expand_more</span>
            </summary>
            <div className="flex flex-col gap-1.5 px-2 pb-2">
                {items.map((item) => {
                    const m = item.meta as {
                        area?: string;
                        areas?: string[];
                        itemsCount?: number;
                        progress?: number;
                        flaggedCount?: number;
                        assumptionName?: string;
                        isAssignedToMe?: boolean;
                        isAssignedToOther?: boolean;
                        exclusivelyAssignedToMe?: boolean;
                        unitName?: string;
                        supplier?: string | null;
                        isQuick?: boolean;
                        isReceivingOverdue?: boolean;
                        timeLabelOverride?: string | null;
                        isRequired?: boolean;
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
                            areas={m.areas}
                            itemsCount={m.itemsCount}
                            supplier={m.supplier}
                            isReceivingOverdue={m.isReceivingOverdue}
                            progress={m.progress}
                            flaggedCount={m.flaggedCount}
                            isRequired={m.isRequired}
                            assumptionName={m.assumptionName}
                            isAssignedToMe={m.isAssignedToMe}
                            isAssignedToOther={m.isAssignedToOther}
                            exclusivelyAssignedToMe={m.exclusivelyAssignedToMe}
                            unitName={m.unitName}
                            onClick={item.onClick}
                        />
                    );
                })}
            </div>
        </details>
    );
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
