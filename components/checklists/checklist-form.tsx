"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { RecurrencePicker } from "./recurrence-picker-modal";
import { DailyConfig } from "./recurrence/daily-config";
import { WeeklyConfig } from "./recurrence/weekly-config";
import { MonthlyConfig } from "./recurrence/monthly-config";
import { YearlyConfig } from "./recurrence/yearly-config";
import type { RecurrenceConfig, RecurrenceV2 } from "@/lib/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { TaskItem } from "./task-item";
import { ExtendedChecklist } from "./checklist-card";
import { useCreateChecklist, useUpdateChecklist, useDeleteChecklist, useReorderTasks } from "@/lib/hooks/use-checklists";
import { ChecklistTask } from "@/lib/types";
import type { ChecklistTemplate } from "@/lib/types";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useEquipe } from "@/lib/hooks/use-equipe";
import { useAllAreas } from "@/lib/hooks/use-areas";
import { useShifts } from "@/lib/hooks/use-shifts";
import { useUserShifts } from "@/lib/hooks/use-user-roles-shifts";
import isEqual from "lodash/isEqual";
import { getDraft, saveDraft, removeDraft, type DraftData } from "@/lib/utils/draft-storage";
import { describeRecurrence } from "@/lib/utils/recurrence/describe";
import { durationMinutes, addDuration, formatDuration } from "@/lib/utils/time-window";
import { useCanManageChecklists } from "@/lib/hooks/use-can-manage-checklists";
import { isBillingError } from "@/lib/billing/client-errors";

const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface ChecklistFormProps {
    checklist: ExtendedChecklist | null;
    onSaved: () => void;
    onCancel: () => void;
    disableReorder?: boolean;
    initialAreaId?: string;
    // Sprint 70 — quando presente (e checklist=null), pré-preenche o form a partir
    // de um modelo do catálogo, em modo de CRIAÇÃO. Caminho aditivo e isolado:
    // sem este prop, o comportamento de criar/editar permanece inalterado.
    initialTemplate?: ChecklistTemplate | null;
}

// Sprint 70 — mapeia itens de um modelo para o shape de tasks do form (com tempId).
function mapTemplateItemsToTasks(template: ChecklistTemplate): (Partial<ChecklistTask> & { tempId: string })[] {
    const items = [...(template.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return items.map((item, idx) => ({
        tempId: `tpl-${idx}-${item.item_slug}`,
        title: item.title,
        description: item.description ?? "",
        requires_photo: item.requires_photo,
        is_critical: item.is_critical,
        requires_observation: item.requires_observation,
        type: item.type ?? 'boolean',
        max_photos: item.max_photos ?? null,
        task_config: item.task_config ?? null,
        order: item.order,
    }));
}

// Sprint 61: o seletor de turno deixou de usar uma lista fixa
// (Manhã/Tarde/Noite/Qualquer). Agora carrega dinamicamente os turnos reais
// cadastrados em Configurações → Turnos (`shiftsData`) + "Todos os turnos".

// Deriva o enum legado `shift` (sombra de compat) a partir do shift_type do
// turno selecionado. Turno sem shift_type → 'any'.
function deriveShiftEnumFromType(shiftType: string | null | undefined): "morning" | "afternoon" | "evening" | "any" {
    if (shiftType === 'morning' || shiftType === 'afternoon' || shiftType === 'evening') return shiftType;
    return 'any';
}

// "HH:MM:SS" | "HH:MM" → "HH:MM"
function toHHMM(t: string | null | undefined): string | null {
    if (!t) return null;
    return t.slice(0, 5);
}

// Opções fixas do dropdown (PR 4 - UX). Cada uma representa um intent claro:
// "Todos os dias" e "Dias do turno" não abrem modal (set direto). As demais
// abrem um modal específico onde o admin configura os parâmetros.
type RecurrenceDropdownOption =
    | 'shift_days'
    | 'todos_os_dias'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'custom';

const RECURRENCE_DROPDOWN_OPTIONS: { value: RecurrenceDropdownOption; label: string }[] = [
    { value: 'shift_days', label: 'Dias do turno' },
    { value: 'todos_os_dias', label: 'Todos os dias' },
    { value: 'daily', label: 'Diário (exceto)' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'yearly', label: 'Anual' },
    { value: 'custom', label: 'Personalizar' },
];

/**
 * Deriva qual opção do dropdown deve estar selecionada a partir do estado
 * atual de `recurrence` + `recurrence_config` (v1 ou v2). Sem efeitos colaterais.
 */
function deriveDropdownOption(
    recurrence: string | null | undefined,
    config: RecurrenceConfig | RecurrenceV2 | null | undefined,
): RecurrenceDropdownOption {
    const isV2 =
        typeof config === 'object' &&
        config !== null &&
        (config as { version?: unknown }).version === 2;

    if (isV2) {
        const v2 = config as RecurrenceV2;
        if (v2.type === 'daily') return 'todos_os_dias';
        if (v2.type === 'shift_days') return 'shift_days';
        if (v2.type === 'weekly') return 'weekly';
        if (v2.type === 'monthly') return 'monthly';
        if (v2.type === 'yearly') return 'yearly';
        if (v2.type === 'custom') return 'custom';
    }

    // v1 fallback: usa a coluna text legacy
    if (recurrence === 'daily') return 'todos_os_dias';
    if (recurrence === 'weekdays') return 'weekly';   // legado: weekly seg-sex
    if (recurrence === 'shift_days') return 'shift_days';
    if (recurrence === 'weekly') return 'weekly';
    if (recurrence === 'monthly') return 'monthly';
    if (recurrence === 'yearly') return 'yearly';
    if (recurrence === 'custom') return 'custom';
    return 'todos_os_dias'; // default seguro
}
// s61: 'receiving' deixou de ser tipo selecionável em Rotinas — agora vive no
// módulo dedicado /recebimentos (templates + execuções). A opção permanece
// disponível APENAS em edição de rotinas legadas que já tenham esse tipo,
// para preservar o registro no save.
const CHECKLIST_TYPES_BASE = [
    { value: 'regular', label: 'Regular' },
    { value: 'opening', label: 'Abertura' },
    { value: 'closing', label: 'Fechamento' },
];
const CHECKLIST_TYPE_LEGACY_RECEIVING = { value: 'receiving', label: 'Recebimento (legado)' };

/**
 * Avalia se um draft local de rotina nova vale a pena restaurar — evita
 * "lixo" de drafts vazios (e.g. usuário abriu o form, fechou sem digitar).
 */
function hasMeaningfulDraft(parsed: DraftData): boolean {
    const name = (parsed.name ?? "").toString().trim();
    const description = (parsed.description ?? "").toString().trim();
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    return name.length > 0 || description.length > 0 || tasks.length > 0;
}

/** Sprint 92 — leitura tolerante do draft: aceita o formato antigo (id único). */
function readDraftAreas(parsed: DraftData, checklist: ExtendedChecklist | null): string[] {
    if (Array.isArray(parsed.areaIds)) return parsed.areaIds;
    if (parsed.areaId) return [parsed.areaId as string];
    return checklist ? currentAreaIds(checklist) : [];
}

function readDraftResponsibles(parsed: DraftData): string[] {
    if (Array.isArray(parsed.responsibleIds)) return parsed.responsibleIds;
    if (parsed.assignedToUserId) return [parsed.assignedToUserId as string];
    return [];
}

/** Áreas efetivas da rotina carregada (N:N com fallback para a sombra). */
function currentAreaIds(checklist: ExtendedChecklist): string[] {
    if (checklist.area_ids?.length) return checklist.area_ids;
    return checklist.area_id ? [checklist.area_id] : [];
}

/** Responsáveis efetivos da rotina carregada (N:N com fallback para a sombra). */
function currentResponsibleIds(checklist: ExtendedChecklist): string[] {
    if (checklist.responsible_user_ids?.length) return checklist.responsible_user_ids;
    return checklist.assigned_to_user_id ? [checklist.assigned_to_user_id] : [];
}

export function ChecklistForm({ checklist, onSaved, onCancel, disableReorder = false, initialAreaId, initialTemplate }: ChecklistFormProps) {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    // Sprint 66: `shiftIds` (N:N) é a fonte da verdade. Conjunto vazio = "Todos
    // os turnos". `shift` (enum) é sombra derivada para consumidores legados.
    const [shiftIds, setShiftIds] = useState<string[]>([]);
    const [checklistType, setChecklistType] = useState("regular");
    // Sprint 92 — responsáveis específicos (N:N). Vazio = toda a equipe das áreas.
    const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
    const [isIndividualMode, setIsIndividualMode] = useState(false);
    const [isRequired, setIsRequired] = useState(true);
    const [recurrence, setRecurrence] = useState("daily");
    // Sprint 8: Time window
    const [hasTimeWindow, setHasTimeWindow] = useState(false);
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    // Modo de definição do fim da janela: "time" (informa o horário final, padrão e
    // retrocompatível) ou "duration" (informa a duração e o fim é calculado).
    // Estado apenas de UI — sempre persistimos start_time/end_time.
    const [endMode, setEndMode] = useState<"time" | "duration">("time");
    const [durationHours, setDurationHours] = useState("");
    const [durationMins, setDurationMins] = useState("");
    // Sprint 8 (v1) + Sprint 34 (v2): aceita ambos formatos.
    // Identidade do objeto importa: se admin não tocar no dropdown nem no picker,
    // permanece o original carregado do banco — backend trata como v1.
    const [recurrenceConfig, setRecurrenceConfig] = useState<RecurrenceConfig | RecurrenceV2 | null | undefined>(undefined);
    // Sequence order
    const [enforceSequentialOrder, setEnforceSequentialOrder] = useState(false);
    // Sprint 76: permite iniciar a rotina antes do start_time (só relevante com janela de horário)
    const [allowEarlyStart, setAllowEarlyStart] = useState(false);
    const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
    // PR 4 (UX): qual modal de configuração v2 está aberto. `null` = nenhum.
    const [activeRecurrenceModal, setActiveRecurrenceModal] = useState<
        'daily' | 'weekly' | 'monthly' | 'yearly' | null
    >(null);
    // Valor selecionado no <select> — derivado do estado atual (v1 ou v2),
    // sem efeitos colaterais. Garante que o select reflita o que está salvo
    // mesmo quando o admin abre uma rotina existente.
    const dropdownValue = useMemo(
        () => deriveDropdownOption(recurrence, recurrenceConfig),
        [recurrence, recurrenceConfig],
    );

    // Sprint 48: receiving = variante de rotina (não módulo separado).
    // UI muda condicionalmente; backend ignora os campos quando type != 'receiving'.
    const isReceiving = checklistType === 'receiving';

    const taskInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [tasks, setTasks] = useState<(Partial<ChecklistTask> & { tempId: string })[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "blocked">("idle");
    const canManage = useCanManageChecklists();
    const blockedByBilling = !canManage.loading && !canManage.allowed;
    const isFirstLoad = useRef(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const previousStateRef = useRef<any>(null);
    const isSavingRef = useRef(false);
    const isPublishingRef = useRef(false);

    // Sprint 92 — áreas da rotina (N:N). Todas com o mesmo peso, sem área principal.
    const [areaIds, setAreaIds] = useState<string[]>([]);
    // Confirmação antes de remover uma área que tem responsáveis específicos dela.
    const [pendingAreaRemoval, setPendingAreaRemoval] = useState<{ areaId: string; areaName: string; affected: { user_id: string; name: string }[] } | null>(null);
    // Draft de rotina nova encontrado em localStorage — aguardando decisão do usuário
    const [pendingDraftRestore, setPendingDraftRestore] = useState<DraftData | null>(null);

    // Snapshot do estado original da rotina carregada do banco
    // Usado para: (1) preservar status original no auto-save, (2) comparação de dirty state
    const originalChecklistRef = useRef<{ status: string; area_ids: string[] } | null>(null);

    const { data: equipeData } = useEquipe(restaurantId || null);
    const { data: areas = [] } = useAllAreas(restaurantId || undefined);
    const { data: shiftsData = [] } = useShifts(restaurantId || undefined);

    // Turnos selecionados (N:N) e dias — fonte da verdade do preview e da
    // recorrência 'shift_days' (UNIÃO dos dias de todos os turnos da rotina).
    const selectedShifts = useMemo(
        () => shiftsData.filter(s => shiftIds.includes(s.id)),
        [shiftsData, shiftIds]);
    const resolvedShiftDays = selectedShifts.length > 0
        ? [...new Set(selectedShifts.flatMap(s => s.days_of_week))].sort((a, b) => a - b)
        : null;
    // Enum sombra derivado (compat): 1 turno com type → esse; senão 'any'.
    const shift = useMemo(
        () => (shiftIds.length === 1 ? deriveShiftEnumFromType(shiftsData.find(s => s.id === shiftIds[0])?.shift_type) : 'any'),
        [shiftIds, shiftsData]);
    const selectedShiftNames = selectedShifts.map(s => s.name);

    // Sprint 66 (req #8): aviso NÃO-bloqueante quando o horário de conclusão
    // ultrapassa o fim de TODOS os turnos selecionados. Aplicado quando há turno
    // específico; trata virada de meia-noite. Não-bloqueante.
    const shiftEndWarning = (() => {
        if (selectedShifts.length === 0 || !hasTimeWindow || !endTime) return null;
        const exceedsAll = selectedShifts.every((s) => {
            const shiftEnd = toHHMM(s.end_time);
            const shiftStart = toHHMM(s.start_time);
            if (!shiftEnd) return false;
            const isOvernight = !!shiftStart && shiftEnd < shiftStart;
            return isOvernight
                ? (endTime > shiftEnd && (!shiftStart || endTime < shiftStart))
                : endTime > shiftEnd;
        });
        if (!exceedsAll) return null;
        return { shiftNames: selectedShiftNames.join(', '), endTime };
    })();

    // Duração da janela (em minutos) para o informativo "Tempo disponível".
    // `null` quando o horário é incompleto/inválido — nesse caso não exibimos.
    const availableMinutes = durationMinutes(startTime, endTime);

    // Janela inválida: ambos horários preenchidos mas o fim não é maior que o início.
    // Bloqueia o salvar e o auto-save até a correção.
    const timeWindowInvalid = hasTimeWindow && !!startTime && !!endTime && availableMinutes === null;

    // Modo "duração": recalcula o horário final a partir do início + duração informada.
    const recalcEndFromDuration = (start: string, hours: string, mins: string) => {
        const total = (parseInt(hours, 10) || 0) * 60 + (parseInt(mins, 10) || 0);
        setEndTime(addDuration(start, total) ?? "");
    };

    // Ao alternar para "duração", pré-popula h/min a partir da janela atual
    // (preserva dados ao editar rotina antiga). Ao voltar para "horário final",
    // mantém o end_time já calculado.
    const switchToDurationMode = () => {
        const d = durationMinutes(startTime, endTime);
        if (d !== null) {
            setDurationHours(String(Math.floor(d / 60)));
            setDurationMins(String(d % 60));
        }
        setEndMode("duration");
    };

    // Smart default: quando os turnos mudam, sugerir recorrência adequada.
    // Com turnos → 'shift_days' (herda a união dos dias); vazio → 'daily'.
    const shiftIdsKey = shiftIds.join(',');
    const prevShiftIdsRef = useRef(shiftIdsKey);
    useEffect(() => {
        if (prevShiftIdsRef.current === shiftIdsKey) return;
        prevShiftIdsRef.current = shiftIdsKey;
        const autoRecurrences = ['daily', 'shift_days'];
        if (!autoRecurrences.includes(recurrence)) return;
        if (shiftIds.length > 0) {
            setRecurrence('shift_days');
            setRecurrenceConfig({ version: 2, type: 'shift_days' });
        } else {
            setRecurrence('daily');
            setRecurrenceConfig({ version: 2, type: 'daily' });
        }
    }, [shiftIdsKey, shiftIds.length, recurrence]);
    const equipe = equipeData?.equipe || [];

    const activeEquipe = equipe.filter(m => m.active);

    // Sprint 92 — colaboradores elegíveis = UNIÃO dos membros de todas as áreas
    // selecionadas (regra de domínio: responsável ∈ alguma das áreas).
    const filteredEquipe = areaIds.length > 0
        ? activeEquipe.filter(m => m.areas?.some(a => areaIds.includes(a.id)))
        : activeEquipe;

    /** Nome das áreas do colaborador que estão selecionadas — rótulo "Maria · Estoque". */
    const memberAreaLabel = (userId: string): string => {
        const m = activeEquipe.find(x => x.user_id === userId);
        return (m?.areas ?? [])
            .filter(a => areaIds.includes(a.id))
            .map(a => a.name)
            .join(', ');
    };

    // Sprint 66 — turnos de cada colaborador, para segmentar a seleção de
    // responsável pelo turno da rotina.
    const { data: allUserShifts = [] } = useUserShifts(restaurantId || undefined);
    const shiftNameById = useMemo(() => {
        const m = new Map<string, string>();
        shiftsData.forEach(s => m.set(s.id, s.name));
        return m;
    }, [shiftsData]);
    const userShiftIdsByUser = useMemo(() => {
        const m = new Map<string, string[]>();
        allUserShifts.forEach((us) => {
            if (!m.has(us.user_id)) m.set(us.user_id, []);
            m.get(us.user_id)!.push(us.shift_id);
        });
        return m;
    }, [allUserShifts]);
    const memberShiftNames = useCallback((userId: string): string[] =>
        (userShiftIdsByUser.get(userId) ?? []).map(id => shiftNameById.get(id) ?? '—'),
        [userShiftIdsByUser, shiftNameById]);
    // Compatível por INTERSEÇÃO: rotina "Todos os turnos" (vazio) → todos; senão
    // o colaborador precisa compartilhar ao menos um turno com a rotina.
    const isMemberShiftCompatible = useCallback((userId: string): boolean => {
        if (shiftIds.length === 0) return true;
        const userShifts = userShiftIdsByUser.get(userId) ?? [];
        return shiftIds.some(id => userShifts.includes(id));
    }, [shiftIds, userShiftIdsByUser]);
    const compatibleMembers = useMemo(
        () => filteredEquipe.filter(m => isMemberShiftCompatible(m.user_id)),
        [filteredEquipe, isMemberShiftCompatible]);
    const incompatibleMembers = useMemo(
        () => filteredEquipe.filter(m => !isMemberShiftCompatible(m.user_id)),
        [filteredEquipe, isMemberShiftCompatible]);
    const selectedShiftLabel = shiftIds.length > 0 ? selectedShiftNames.join(', ') : null;

    const createMutation = useCreateChecklist();
    const updateMutation = useUpdateChecklist();
    const deleteMutation = useDeleteChecklist();
    const reorderMutation = useReorderTasks();
    const isMobile = useIsMobile();
    const [isReorderMode, setIsReorderMode] = useState(false);

    useEffect(() => {
        if (!isMobile) setIsReorderMode(false);
    }, [isMobile]);

    const prevChecklistId = useRef<string | null>(null);

    useEffect(() => {
        // Only reset the whole form if the checklist ID changes
        // This prevents background refetches from wiping local unsaved changes
        const currentId = checklist?.id || (!checklist ? 'new' : null);
        if (currentId === prevChecklistId.current && checklist !== null) {
            return;
        }
        prevChecklistId.current = currentId;

        if (checklist) {
            // Priority: Local Draft (if exists) > Checklist Props
            const parsed = getDraft(checklist.id, restaurantId);

            if (parsed) {
                setName(parsed.name ?? "");
                setDescription(parsed.description ?? "");
                setShiftIds(parsed.shiftIds ?? (parsed.shiftId ? [parsed.shiftId] : []));
                setChecklistType(parsed.checklistType ?? "regular");
                setResponsibleIds(readDraftResponsibles(parsed));
                setIsIndividualMode(parsed.isIndividualMode ?? readDraftResponsibles(parsed).length > 0);
                setIsRequired(parsed.isRequired ?? true);
                setRecurrence(parsed.recurrence === 'none' ? 'daily' : (parsed.recurrence ?? "daily"));
                setStartTime(parsed.startTime ?? "");
                setEndTime(parsed.endTime ?? "");
                setHasTimeWindow(parsed.hasTimeWindow ?? false);
                setRecurrenceConfig(parsed.recurrenceConfig ?? undefined);
                setEnforceSequentialOrder(parsed.enforceSequentialOrder ?? false);
                setAllowEarlyStart(parsed.allowEarlyStart ?? false);
                setAreaIds(readDraftAreas(parsed, checklist));
                setTasks(parsed.tasks ?? []);
                setSaveState("saved");
                isFirstLoad.current = false;
                previousStateRef.current = {
                    name: parsed.name ?? "",
                    description: parsed.description ?? "",
                    shiftIds: parsed.shiftIds ?? (parsed.shiftId ? [parsed.shiftId] : []),
                    checklistType: parsed.checklistType ?? "regular",
                    responsibleIds: readDraftResponsibles(parsed),
                    isIndividualMode: parsed.isIndividualMode ?? readDraftResponsibles(parsed).length > 0,
                    isRequired: parsed.isRequired ?? true,
                    recurrence: parsed.recurrence === 'none' ? 'daily' : (parsed.recurrence ?? "daily"),
                    startTime: parsed.startTime ?? "",
                    endTime: parsed.endTime ?? "",
                    hasTimeWindow: parsed.hasTimeWindow ?? false,
                    recurrenceConfig: parsed.recurrenceConfig ?? undefined,
                    enforceSequentialOrder: parsed.enforceSequentialOrder ?? false,
                    allowEarlyStart: parsed.allowEarlyStart ?? false,
                    areaIds: readDraftAreas(parsed, checklist),
                    tasks: parsed.tasks ?? [],
                };
                // Sempre capturar status/áreas originais do banco (não do draft)
                originalChecklistRef.current = {
                    status: checklist.status || 'active',
                    area_ids: currentAreaIds(checklist),
                };
                return; // Skip setting from props since we used draft
            }

            const loadedName = checklist.name;
            const loadedDescription = checklist.description || "";
            const loadedShiftIds = checklist.shift_ids ?? (checklist.shift_id ? [checklist.shift_id] : []);
            const loadedChecklistType = checklist.checklist_type || "regular";
            const loadedResponsibleIds = currentResponsibleIds(checklist);
            const loadedIsIndividualMode = checklist.assignment_type === 'user' || loadedResponsibleIds.length > 0;
            const loadedIsRequired = checklist.is_required ?? true;
            const loadedRecurrence = (!checklist.recurrence || (checklist.recurrence as string) === 'none') ? 'daily' : checklist.recurrence;
            // Sprint 8: time window
            const st = checklist.start_time as string | undefined;
            const et = checklist.end_time as string | undefined;
            const loadedStartTime = st || "";
            const loadedEndTime = et || "";
            const loadedHasTimeWindow = !!(st || et);
            // Sprint 8: recurrence config
            const loadedRecurrenceConfig = checklist.recurrence_config as RecurrenceConfig | undefined;
            const loadedEnforceSequentialOrder = checklist.enforce_sequential_order ?? false;
            const loadedAllowEarlyStart = checklist.allow_early_start ?? false;
            const loadedAreaIds = currentAreaIds(checklist);
            const loadedTasks = (checklist.tasks || []).map((t) => ({ ...t, tempId: t.id }));

            setName(loadedName);
            setDescription(loadedDescription);
            setShiftIds(loadedShiftIds);
            setChecklistType(loadedChecklistType);
            setResponsibleIds(loadedResponsibleIds);
            setIsIndividualMode(loadedIsIndividualMode);
            setIsRequired(loadedIsRequired);
            setRecurrence(loadedRecurrence);
            setStartTime(loadedStartTime);
            setEndTime(loadedEndTime);
            setHasTimeWindow(loadedHasTimeWindow);
            setRecurrenceConfig(loadedRecurrenceConfig);
            setEnforceSequentialOrder(loadedEnforceSequentialOrder);
            setAllowEarlyStart(loadedAllowEarlyStart);
            setAreaIds(loadedAreaIds);
            setTasks(loadedTasks);

            // FIX: Capturar snapshot IDÊNTICO ao formState que será gerado após o re-render
            // Isso garante que isEqual() retorne true no auto-save, impedindo save sem interação
            previousStateRef.current = {
                name: loadedName,
                description: loadedDescription,
                shiftIds: loadedShiftIds,
                checklistType: loadedChecklistType,
                responsibleIds: loadedResponsibleIds,
                isIndividualMode: loadedIsIndividualMode,
                isRequired: loadedIsRequired,
                recurrence: loadedRecurrence,
                startTime: loadedStartTime,
                endTime: loadedEndTime,
                hasTimeWindow: loadedHasTimeWindow,
                recurrenceConfig: loadedRecurrenceConfig,
                enforceSequentialOrder: loadedEnforceSequentialOrder,
                allowEarlyStart: loadedAllowEarlyStart,
                areaIds: loadedAreaIds,
                tasks: loadedTasks,
            };
            isFirstLoad.current = false;

            // Capturar snapshot original para preservar status e proteger campos críticos
            originalChecklistRef.current = {
                status: checklist.status || 'active',
                area_ids: loadedAreaIds,
            };
            setSaveState("idle");
        } else if (initialTemplate) {
            // Sprint 70 — Modo "importar modelo": pré-preenche a partir do catálogo,
            // como rotina NOVA. Não restaura draft (importação tem prioridade).
            setName(initialTemplate.name);
            setDescription(initialTemplate.description ?? "");
            setShiftIds([]);
            setChecklistType(initialTemplate.suggested_type ?? "regular");
            setResponsibleIds([]);
            setIsIndividualMode(false);
            setIsRequired(true);
            setRecurrence("daily");
            setStartTime("");
            setEndTime("");
            setHasTimeWindow(false);
            setRecurrenceConfig(undefined);
            setEnforceSequentialOrder(false);
            setAllowEarlyStart(false);
            setAreaIds(initialAreaId ? [initialAreaId] : []);
            setTasks(mapTemplateItemsToTasks(initialTemplate));
            setErrorMsg(null);
            setShowDeleteModal(false);
            setSaveState("idle");
            setPendingDraftRestore(null);
        } else {
            // Modo "nova rotina": iniciar sempre limpo. Se houver draft local salvo,
            // não aplicar automaticamente — perguntar ao usuário (ver pendingDraftRestore).
            setName("");
            setDescription("");
            setShiftIds([]);
            setChecklistType("regular");
            setResponsibleIds([]);
            setIsIndividualMode(false);
            setIsRequired(true);
            setRecurrence("daily");
            setStartTime("");
            setEndTime("");
            setHasTimeWindow(false);
            setRecurrenceConfig(undefined);
            setEnforceSequentialOrder(false);
            setAllowEarlyStart(false);
            setAreaIds(initialAreaId ? [initialAreaId] : []);
            setTasks([]);
            setErrorMsg(null);
            setShowDeleteModal(false);
            setSaveState("idle");

            const parsed = getDraft(null, restaurantId);
            if (parsed && hasMeaningfulDraft(parsed)) {
                setPendingDraftRestore(parsed);
            } else {
                setPendingDraftRestore(null);
            }
        }
    }, [checklist, initialAreaId, initialTemplate, restaurantId]);

    const applyPendingDraft = useCallback(() => {
        const parsed = pendingDraftRestore;
        if (!parsed) return;

        const draftName = parsed.name ?? "";
        const draftDescription = parsed.description ?? "";
        const draftShiftIds = parsed.shiftIds ?? (parsed.shiftId ? [parsed.shiftId] : []);
        const draftChecklistType = parsed.checklistType ?? "regular";
        const draftResponsibleIds = readDraftResponsibles(parsed);
        const draftIsIndividualMode = parsed.isIndividualMode ?? draftResponsibleIds.length > 0;
        const draftIsRequired = parsed.isRequired ?? true;
        const draftRecurrence = parsed.recurrence === 'none' ? 'daily' : (parsed.recurrence ?? "daily");
        const draftStartTime = parsed.startTime ?? "";
        const draftEndTime = parsed.endTime ?? "";
        const draftHasTimeWindow = parsed.hasTimeWindow ?? false;
        const draftRecurrenceConfig = parsed.recurrenceConfig ?? undefined;
        const draftEnforceSequentialOrder = parsed.enforceSequentialOrder ?? false;
        const draftAllowEarlyStart = parsed.allowEarlyStart ?? false;
        const draftAreaIds = readDraftAreas(parsed, null);
        const draftTasks = parsed.tasks ?? [];

        setName(draftName);
        setDescription(draftDescription);
        setShiftIds(draftShiftIds);
        setChecklistType(draftChecklistType);
        setResponsibleIds(draftResponsibleIds);
        setIsIndividualMode(draftIsIndividualMode);
        setIsRequired(draftIsRequired);
        setRecurrence(draftRecurrence);
        setStartTime(draftStartTime);
        setEndTime(draftEndTime);
        setHasTimeWindow(draftHasTimeWindow);
        setRecurrenceConfig(draftRecurrenceConfig);
        setEnforceSequentialOrder(draftEnforceSequentialOrder);
        setAllowEarlyStart(draftAllowEarlyStart);
        setAreaIds(draftAreaIds);
        setTasks(draftTasks);
        setSaveState("saved");
        isFirstLoad.current = false;
        previousStateRef.current = {
            name: draftName, description: draftDescription, shiftIds: draftShiftIds,
            checklistType: draftChecklistType, responsibleIds: draftResponsibleIds,
            isIndividualMode: draftIsIndividualMode, isRequired: draftIsRequired,
            recurrence: draftRecurrence, startTime: draftStartTime, endTime: draftEndTime,
            hasTimeWindow: draftHasTimeWindow, recurrenceConfig: draftRecurrenceConfig,
            enforceSequentialOrder: draftEnforceSequentialOrder,
            allowEarlyStart: draftAllowEarlyStart,
            areaIds: draftAreaIds, tasks: draftTasks,
        };
        setPendingDraftRestore(null);
    }, [pendingDraftRestore]);

    const discardPendingDraft = useCallback(() => {
        removeDraft(null, restaurantId);
        setPendingDraftRestore(null);
    }, [restaurantId]);

    useEffect(() => {
        const formState = {
            name, description, shiftIds, checklistType, responsibleIds, isIndividualMode,
            isRequired, recurrence, startTime, endTime, hasTimeWindow,
            recurrenceConfig, enforceSequentialOrder, allowEarlyStart,
            areaIds, tasks
        };

        // GUARD 1: Primeira execução — apenas capturar snapshot se init não o fez
        // (caso de new checklist sem draft, onde init não define previousStateRef)
        if (isFirstLoad.current) {
            isFirstLoad.current = false;
            if (!previousStateRef.current) {
                previousStateRef.current = formState;
            }
            return;
        }

        // GUARD 2: Snapshot ainda não definido (init useEffect não rodou ainda)
        // Isso acontece quando o auto-save effect executa antes do init no mesmo render cycle
        if (!previousStateRef.current) {
            previousStateRef.current = formState;
            return;
        }

        if (!name.trim() && tasks.length === 0) return;
        if (!tasks || tasks.length === 0) return; // Prevent deleting tasks by accidentally sending empty list
        if (timeWindowInvalid) return; // Não persistir janela de horário inválida (fim <= início)

        // GUARD 3: Comparação profunda — só prosseguir se houve mudança REAL
        if (isEqual(previousStateRef.current, formState)) return;
        if (isPublishingRef.current) return;

        // GUARD 4: Billing bloqueado — não agenda o save remoto, mantém o draft
        // local para o usuário retomar após assinar. Bloqueia o ciclo inteiro
        // (debounce + mutation), não apenas o submit final.
        if (blockedByBilling) {
            saveDraft(checklist?.id ?? null, restaurantId, formState);
            setSaveState("blocked");
            return;
        }

        saveDraft(checklist?.id ?? null, restaurantId, formState);

        const handler = setTimeout(async () => {
            if (isSavingRef.current) return;

            setSaveState("saving");

            try {
                if (checklist?.id && restaurantId && updateMutation) {
                    isSavingRef.current = true;

                    // FIX: Montar payload explícito com campos snake_case do banco
                    // Nunca usar ...formState (contém camelCase que polui o payload)
                    const payload = {
                        id: checklist.id,
                        restaurant_id: restaurantId,
                        name,
                        description,
                        shift,
                        shift_ids: shiftIds,
                        checklist_type: checklistType,
                        responsible_user_ids: isIndividualMode ? responsibleIds : [],
                        is_required: isRequired,
                        recurrence,
                        start_time: hasTimeWindow && startTime ? startTime : null,
                        end_time: hasTimeWindow && endTime ? endTime : null,
                        // PR 3: enviar config como está no estado.
                        // - v1: pode ser null/undefined ou objeto v1 legacy → backend trata como v1
                        // - v2: objeto com version=2 → backend valida e persiste estruturado
                        recurrence_config: recurrenceConfig ?? null,
                        enforce_sequential_order: enforceSequentialOrder,
                        allow_early_start: allowEarlyStart,
                        area_ids: areaIds,
                        target_role: checklist.target_role || 'all',
                        assignment_type: (isIndividualMode && responsibleIds.length > 0) ? 'user' : 'area',
                        // FIX BUG 1: Preservar status original — auto-save NUNCA deve mudar o status
                        status: originalChecklistRef.current?.status || checklist.status || 'active',
                        skipInvalidation: true,
                        tasks: tasks.map(t => ({
                            id: t.id || undefined,
                            title: t.title,
                            description: t.description || "",
                            is_critical: t.is_critical || false,
                            requires_photo: t.requires_photo || false,
                            requires_observation: t.requires_observation || false,
                            type: t.type || 'boolean',
                            max_photos: t.max_photos ?? null,
                            task_config: t.task_config ?? null,
                            assigned_to_user_id: t.assigned_to_user_id || undefined
                        }))
                    };

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await updateMutation.mutateAsync(payload as any);

                    previousStateRef.current = formState;
                    setSaveState("saved");
                } else {
                    setSaveState("saved"); // Apenas local para creation
                }
            } catch (error) {
                if (isBillingError(error)) {
                    // Race condition: client achava que podia salvar (cache stale),
                    // mas o server retornou 402. Refletir como bloqueado, sem
                    // fallback enganoso de "salvo localmente".
                    setSaveState("blocked");
                } else {
                    console.error("Autosave Remoto Falhou", error);
                    setSaveState("error");
                }
            } finally {
                isSavingRef.current = false;
            }
        }, 1500);

        return () => clearTimeout(handler);
    }, [name, description, shift, shiftIds, checklistType, responsibleIds, isIndividualMode, isRequired, recurrence, startTime, endTime, hasTimeWindow, recurrenceConfig, enforceSequentialOrder, allowEarlyStart, areaIds, tasks, checklist, restaurantId, updateMutation, blockedByBilling, timeWindowInvalid]);

    const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
    const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
    const sensors = useSensors(...(isMobile ? [] : [pointerSensor, keyboardSensor]));

    const performTaskReorder = async (oldIndex: number, newIndex: number) => {
        if (oldIndex === newIndex) return;

        const previousTasks = tasks;
        const newTasks = arrayMove(previousTasks, oldIndex, newIndex);

        setTasks(newTasks);

        if (!checklist?.id || !restaurantId || disableReorder) return;

        const taskOrders = newTasks
            .filter(t => t.id)
            .map((t, index) => ({ id: t.id as string, order: index }));

        if (taskOrders.length === 0) return;

        try {
            await reorderMutation.mutateAsync({ checklistId: checklist.id, restaurantId, taskOrders });
        } catch (e) {
            setTasks(previousTasks);
            setErrorMsg(e instanceof Error ? e.message : 'Erro ao salvar ordem das tarefas');
        }
    };

    const handleDragEnd = async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = tasks.findIndex(i => i.tempId === active.id);
        const newIndex = tasks.findIndex(i => i.tempId === over.id);
        await performTaskReorder(oldIndex, newIndex);
    };

    const addTask = (afterTempId?: string) => {
        const newTempId = Math.random().toString();
        const newTask = {
            tempId: newTempId,
            title: "",
            is_critical: false,
            requires_photo: false,
            requires_observation: false,
            type: 'boolean' as const,
            max_photos: null,
            task_config: null,
        };
        if (afterTempId) {
            setTasks(prev => {
                const idx = prev.findIndex(t => t.tempId === afterTempId);
                const next = [...prev];
                next.splice(idx + 1, 0, newTask);
                return next;
            });
        } else {
            setTasks(prev => [...prev, newTask]);
        }
        setTimeout(() => { taskInputRefs.current[newTempId]?.focus(); }, 50);
    };

    const updateTask = (id: string, updates: Partial<ChecklistTask>) => {
        setTasks(tasks.map((t) => (t.tempId === id ? { ...t, ...updates } : t)));
    };

    const removeTask = (id: string) => {
        setTasks(tasks.filter((t) => t.tempId !== id));
    };

    /**
     * Sprint 92 — marca/desmarca uma área.
     *
     * Ao REMOVER uma área que tem responsáveis específicos dela e de mais nenhuma
     * outra área selecionada, pede confirmação antes: tirar a área tira essas
     * pessoas do escopo da rotina, e isso não pode acontecer em silêncio.
     */
    const toggleArea = (id: string, name: string) => {
        if (!areaIds.includes(id)) {
            setAreaIds([...areaIds, id]);
            return;
        }

        const remaining = areaIds.filter(x => x !== id);
        const affected = responsibleIds
            .map(uid => activeEquipe.find(m => m.user_id === uid))
            .filter((m): m is NonNullable<typeof m> => Boolean(m))
            .filter(m => !m.areas?.some(a => remaining.includes(a.id)))
            .map(m => ({ user_id: m.user_id, name: m.name }));

        if (affected.length > 0) {
            setPendingAreaRemoval({ areaId: id, areaName: name, affected });
            return;
        }
        setAreaIds(remaining);
    };

    const confirmAreaRemoval = () => {
        if (!pendingAreaRemoval) return;
        const removedUserIds = new Set(pendingAreaRemoval.affected.map(a => a.user_id));
        setAreaIds(areaIds.filter(x => x !== pendingAreaRemoval.areaId));
        setResponsibleIds(responsibleIds.filter(uid => !removedUserIds.has(uid)));
        setPendingAreaRemoval(null);
    };

    const handleSave = async () => {
        if (!name.trim() || !restaurantId) return;

        if (timeWindowInvalid) {
            setErrorMsg('O horário de término deve ser maior que o horário de início.');
            return;
        }

        if (areaIds.length === 0) {
            setErrorMsg('Selecione ao menos uma área para a rotina.');
            return;
        }

        if (isIndividualMode && responsibleIds.length === 0) {
            setErrorMsg('Selecione ao menos um responsável ou mude a atribuição para toda a equipe.');
            return;
        }

        if (tasks.length === 0) {
            setErrorMsg('Adicione ao menos uma tarefa para salvar a rotina.');
            return;
        }

        if (recurrence === 'custom') {
            // PR 3: validação client-side legada só vale para v1 ('custom' com
            // frequency='weekly' precisa days_of_week). Para v2, o backend valida.
            const cfg = recurrenceConfig;
            const isV2 =
                typeof cfg === 'object' &&
                cfg !== null &&
                (cfg as { version?: unknown }).version === 2;
            if (!isV2) {
                const days = (cfg as RecurrenceConfig | null | undefined)?.days_of_week;
                if (!Array.isArray(days) || days.length === 0) {
                    setErrorMsg('Recorrência personalizada exige ao menos um dia da semana selecionado.');
                    return;
                }
            }
        }

        const payload = {
            restaurant_id: restaurantId,
            name,
            description,
            shift: shift as "morning" | "afternoon" | "evening" | "any",
            shift_ids: shiftIds,
            checklist_type: checklistType as "regular" | "opening" | "closing" | "receiving",
            responsible_user_ids: isIndividualMode ? responsibleIds : [],
            is_required: isRequired,
            recurrence,
            start_time: hasTimeWindow && startTime ? startTime : null,
            end_time: hasTimeWindow && endTime ? endTime : null,
            // PR 3: igual ao auto-save — envia config como está no estado.
            recurrence_config: recurrenceConfig ?? null,
            enforce_sequential_order: enforceSequentialOrder,
            allow_early_start: allowEarlyStart,
            area_ids: areaIds,
            assignment_type: (isIndividualMode && responsibleIds.length > 0) ? 'user' : 'area',
            // Em update, preserva status original (active/archived). Em criação, sempre active.
            status: (checklist?.id
                ? (originalChecklistRef.current?.status || 'active')
                : 'active') as "active" | "archived",
            target_role: checklist?.target_role || 'all',
            // Sprint 70 — rastreabilidade da origem: só em criação a partir de modelo.
            ...(initialTemplate && !checklist?.id
                ? { origin_template_id: initialTemplate.id, origin_template_version: initialTemplate.version }
                : {}),
            tasks: tasks.map(t => ({
                id: t.id || undefined,
                title: t.title,
                description: t.description || "",
                is_critical: t.is_critical || false,
                requires_photo: t.requires_photo || false,
                requires_observation: t.requires_observation || false,
                type: t.type || 'boolean',
                max_photos: t.max_photos ?? null,
                task_config: t.task_config ?? null,
                assigned_to_user_id: t.assigned_to_user_id || undefined
            }))
        };

        try {
            setErrorMsg(null);
            isPublishingRef.current = true;
            if (checklist?.id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await updateMutation.mutateAsync({ id: checklist.id, skipInvalidation: false, ...payload } as any);
                await new Promise(resolve => setTimeout(resolve, 300));
                removeDraft(checklist.id, restaurantId);
                setSaveState("idle");
                onSaved();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await createMutation.mutateAsync(payload as any);
                await new Promise(resolve => setTimeout(resolve, 300));
                removeDraft(null, restaurantId);
                setSaveState("idle");
                onSaved();
            }
        } catch (e) {
            console.error(e);
            setErrorMsg(e instanceof Error ? e.message : "Erro inesperado ao salvar a rotina!");
        } finally {
            isPublishingRef.current = false;
        }
    };

    const handleDelete = async () => {
        if (!checklist?.id || !restaurantId) return;
        try {
            await deleteMutation.mutateAsync({ id: checklist.id, restaurantId });
            setShowDeleteModal(false);
            onSaved();
            // Adicionalmente aqui pode ser add um toast se for importado
        } catch (e) {
            console.error(e);
            setErrorMsg("Erro ao arquivar a rotina.");
            setShowDeleteModal(false);
        }
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;

    // PR 3: ao tocar no dropdown, frontend constrói payload v2 estruturado
    // contendo o dia/data atual (em fuso de São Paulo). Resolve R1: opções
    // como "Semanal: toda terça" agora persistem o dia da semana no banco.
    //
    // Nota de promoção v1→v2: tocar no dropdown reflete intenção explícita do
    // admin de aplicar a configuração escolhida — converter para v2 é seguro.
    // Se o admin NÃO tocar, este handler não é chamado e o estado mantém o
    // formato original (v1) que veio do banco.
    // PR 4 (UX): cada opção do dropdown roteia para um caminho distinto.
    // - "Todos os dias" e "Dias do turno" são set diretos (sem modal)
    // - "Diário/Semanal/Mensal/Anual" abrem modal específico para o admin
    //   configurar parâmetros (dias excluídos, weekdays, dia do mês, etc.)
    // - "Personalizar" abre o RecurrencePicker (rrule) — não foi alterado
    //
    // Nota de promoção v1→v2: o estado `recurrenceConfig` só vira v2 se o
    // admin CONFIRMAR uma configuração no modal. Se ele cancela, o estado
    // mantém o valor original — sem promoção acidental.
    const handleRecurrenceChange = useCallback((value: RecurrenceDropdownOption) => {
        if (value === 'shift_days') {
            setRecurrence('shift_days');
            setRecurrenceConfig({ version: 2, type: 'shift_days' });
            return;
        }
        if (value === 'todos_os_dias') {
            setRecurrence('daily');
            setRecurrenceConfig({ version: 2, type: 'daily' });
            return;
        }
        if (value === 'custom') {
            setShowRecurrencePicker(true);
            return;
        }
        // 'daily' | 'weekly' | 'monthly' | 'yearly' → modal específico
        setActiveRecurrenceModal(value);
    }, []);

    // Confirmação dos modais — atualiza estado com payload v2 e fecha modal.
    const handleModalConfirm = useCallback((config: RecurrenceV2) => {
        setRecurrenceConfig(config);
        setRecurrence(config.type);
        setActiveRecurrenceModal(null);
    }, []);

    // Label legível para o admin — funciona tanto para v1 quanto para v2 via
    // describeRecurrence. Substitui a lógica antiga que entendia apenas v1.
    const getRecurrenceLabel = () => {
        if (recurrence !== 'custom') return null;
        if (!recurrenceConfig) return null;
        return describeRecurrence({ recurrence, recurrence_config: recurrenceConfig });
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a1215] relative">
            {pendingDraftRestore && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-[#0a1215]/95 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-[#101d22] border border-[#233f48] rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-start gap-3 mb-4">
                            <span className="material-symbols-outlined text-[#13b6ec] text-[28px] shrink-0">history</span>
                            <div>
                                <h3 className="text-lg font-bold text-white">Continuar rotina não finalizada?</h3>
                                <p className="text-sm text-[#92bbc9] mt-1">
                                    Encontramos uma rotina que você começou neste dispositivo e ainda não finalizou.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-6">
                            <button
                                type="button"
                                onClick={discardPendingDraft}
                                className="flex-1 px-4 py-2 rounded-lg font-bold text-sm text-[#92bbc9] bg-[#16262c] border border-[#233f48] hover:border-[#325a67] hover:text-white transition-colors"
                            >
                                Começar nova
                            </button>
                            <button
                                type="button"
                                onClick={applyPendingDraft}
                                className="flex-1 px-4 py-2 rounded-lg font-bold text-sm bg-[#13b6ec] text-[#111e22] hover:bg-[#10a0d0] transition-colors"
                            >
                                Continuar edição
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b border-[#233f48] shrink-0 bg-[#101d22] gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                        {checklist ? "Editar Rotina" : "Nova Rotina"}
                    </h2>
                    <p className="text-sm text-[#92bbc9] mt-1">
                        Defina os detalhes e tarefas da lista
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end w-full sm:w-auto">
                    {saveState === "saving" && (
                         <span className="text-xs text-[#13b6ec] italic mr-2 flex items-center gap-1">
                             <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                             Salvando na nuvem...
                         </span>
                    )}
                    {saveState === "saved" && (
                         <span className="text-xs text-emerald-400 italic mr-2 flex items-center gap-1">
                             <span className="material-symbols-outlined text-[14px]">cloud_done</span>
                             Salvo
                         </span>
                    )}
                    {saveState === "error" && (
                         <span className="text-xs text-red-400 italic mr-2 flex items-center gap-1" title="Alguns dados só estão salvos localmente">
                             <span className="material-symbols-outlined text-[14px]">cloud_off</span>
                             Erro - salvo apenas neste dispositivo
                         </span>
                    )}
                    {saveState === "blocked" && (
                         <a
                             href="/configuracoes?tab=plano"
                             className="text-xs text-amber-400 italic mr-2 flex items-center gap-1 hover:text-amber-300 hover:underline"
                             title="Período gratuito encerrado — assine um plano para continuar editando"
                         >
                             <span className="material-symbols-outlined text-[14px]">lock</span>
                             Edição bloqueada — assine um plano
                         </a>
                    )}
                    {checklist && (
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="p-2 text-[#92bbc9] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Excluir"
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>
                    )}
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg font-bold text-sm text-[#92bbc9] hover:bg-[#16262c] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => handleSave()}
                        disabled={isLoading || !name.trim() || tasks.length === 0 || timeWindowInvalid}
                        title={timeWindowInvalid ? 'O horário de término deve ser maior que o horário de início' : (tasks.length === 0 ? 'Adicione ao menos uma tarefa para salvar' : undefined)}
                        className="px-4 py-2 rounded-lg font-bold text-sm bg-[#13b6ec] text-[#111e22] hover:bg-[#10a0d0] shadow-[0_4px_14px_0_rgba(19,182,236,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isLoading ? "Salvando..." : "Salvar rotina"}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        aria-label="Fechar"
                        title="Fechar"
                        className="p-2 text-[#92bbc9] hover:text-white hover:bg-[#16262c] rounded-lg transition-colors sm:ml-1"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>

            {/* Formulário Content — 2 colunas em desktop, empilhado em mobile */}
            <div className="flex-1 overflow-y-auto">
                {errorMsg && (
                    <div className="px-6 pt-6">
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl flex items-center gap-3">
                            <span className="material-symbols-outlined shrink-0 text-xl">error</span>
                            <p className="text-sm font-medium">{errorMsg}</p>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-[#233f48]">
                    {/* Coluna esquerda — Dados da rotina */}
                    <div className="px-6 py-6 space-y-6">

                    {/* Card Detalhes Básico */}
                    <div className="bg-[#101d22] border border-[#233f48] rounded-2xl p-6 space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Nome da Lista *</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Abertura do Salão"
                                className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all placeholder:text-[#325a67]"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Descrição</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Instruções gerais para esta rotina..."
                                rows={3}
                                className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all resize-none placeholder:text-[#325a67]"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Turnos</label>
                                <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-3 space-y-1.5">
                                    <label className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                        <input
                                            type="checkbox"
                                            checked={shiftIds.length === 0}
                                            onChange={() => setShiftIds([])}
                                            className="w-4 h-4 accent-[#13b6ec]"
                                        />
                                        <span className="font-medium">Todos os turnos</span>
                                    </label>
                                    {shiftsData.filter(s => s.active).map(s => {
                                        const checked = shiftIds.includes(s.id);
                                        return (
                                            <label key={s.id} className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        const next = checked ? shiftIds.filter(x => x !== s.id) : [...shiftIds, s.id];
                                                        setShiftIds(next);
                                                        // Remove responsáveis cuja interseção com os turnos ficou vazia
                                                        if (responsibleIds.length > 0 && next.length > 0) {
                                                            setResponsibleIds(responsibleIds.filter((uid) => {
                                                                const us = userShiftIdsByUser.get(uid) ?? [];
                                                                return next.some(id => us.includes(id));
                                                            }));
                                                        }
                                                    }}
                                                    className="w-4 h-4 accent-[#13b6ec]"
                                                />
                                                <span>{s.name}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                {shiftsData.filter(s => s.active).length === 0 && (
                                    <p className="text-amber-400 text-xs mt-1.5">
                                        Nenhum turno cadastrado. Cadastre em Configurações &gt; Turnos para segmentar por turno.
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Repetição</label>
                                <select
                                    value={dropdownValue}
                                    onChange={(e) => handleRecurrenceChange(e.target.value as RecurrenceDropdownOption)}
                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                                >
                                    {RECURRENCE_DROPDOWN_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <p className="text-[#92bbc9] text-xs mt-2">{describeRecurrence({ recurrence, recurrence_config: recurrenceConfig })}</p>
                                {recurrence === 'custom' && recurrenceConfig && (
                                    <button
                                        type="button"
                                        onClick={() => setShowRecurrencePicker(true)}
                                        className="mt-2 w-full text-left px-3 py-2 bg-[#13b6ec]/10 border border-[#13b6ec]/30 rounded-lg text-[#13b6ec] text-xs font-medium flex items-center justify-between gap-2 hover:bg-[#13b6ec]/20 transition-colors"
                                    >
                                        <span className="truncate">{getRecurrenceLabel()}</span>
                                        <span className="material-symbols-outlined text-[14px] shrink-0">edit</span>
                                    </button>
                                )}
                                {recurrence === 'shift_days' && (
                                    <div className="mt-2 px-3 py-2 bg-[#13b6ec]/10 border border-[#13b6ec]/30 rounded-lg text-xs">
                                        {resolvedShiftDays && resolvedShiftDays.length > 0 ? (
                                            <span className="text-[#13b6ec] font-medium">
                                                Executada nos dias dos turnos ({selectedShiftLabel}): {resolvedShiftDays.map(d => DAYS_SHORT[d]).join(', ')}
                                            </span>
                                        ) : shiftIds.length === 0 ? (
                                            <span className="text-[#92bbc9]">
                                                &quot;Todos os turnos&quot; selecionado — aparecerá todos os dias
                                            </span>
                                        ) : (
                                            <span className="text-amber-400">
                                                Os turnos selecionados não têm dias configurados. Configure em Configurações &gt; Turnos.
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">
                                    Áreas <span className="text-red-400">*</span>
                                </label>
                                {areas.length === 0 ? (
                                    <p className="text-amber-400 text-xs">
                                        Nenhuma área cadastrada. Cadastre em Configurações &gt; Áreas.
                                    </p>
                                ) : (
                                    <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-3 space-y-1.5 max-h-48 overflow-y-auto">
                                        {areas.map(a => {
                                            const checked = areaIds.includes(a.id);
                                            return (
                                                <label key={a.id} className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleArea(a.id, a.name)}
                                                        className="w-4 h-4 accent-[#13b6ec]"
                                                    />
                                                    <span>{a.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                {areaIds.length === 0 && areas.length > 0 && (
                                    <p className="mt-1.5 text-xs text-amber-400">Selecione ao menos uma área.</p>
                                )}
                                {areaIds.length > 1 && (
                                    <p className="mt-1.5 text-[11px] text-[#92bbc9]">
                                        Qualquer colaborador dessas {areaIds.length} áreas poderá executar esta rotina.
                                    </p>
                                )}
                                {!checklist && initialAreaId && areaIds.length === 1 && areaIds[0] === initialAreaId && (
                                    <p className="mt-1 text-[10px] text-[#5a8a9a]">Área pré-selecionada com base no filtro atual</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Tipo de Rotina</label>
                                <select
                                    value={checklistType}
                                    onChange={(e) => setChecklistType(e.target.value)}
                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all appearance-none"
                                >
                                    {(checklist?.checklist_type === 'receiving'
                                        ? [...CHECKLIST_TYPES_BASE, CHECKLIST_TYPE_LEGACY_RECEIVING]
                                        : CHECKLIST_TYPES_BASE
                                    ).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Atribuição</label>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <button
                                    type="button"
                                    onClick={() => { setIsIndividualMode(false); setResponsibleIds([]); }}
                                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                                        !isIndividualMode
                                            ? 'bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]'
                                            : 'bg-[#16262c] border-[#233f48] text-[#92bbc9] hover:border-[#325a67]'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">groups</span>
                                    Toda a equipe
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsIndividualMode(true)}
                                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                                        isIndividualMode
                                            ? 'bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]'
                                            : 'bg-[#16262c] border-[#233f48] text-[#92bbc9] hover:border-[#325a67]'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">person</span>
                                    Colaboradores específicos
                                </button>
                            </div>

                            {isIndividualMode ? (
                                <div>
                                    {/* s92 — seleção múltipla: união dos membros de TODAS as áreas
                                        marcadas, cada um rotulado com a(s) sua(s) área(s). */}
                                    {filteredEquipe.length > 0 && (
                                        <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-3 space-y-1.5 max-h-56 overflow-y-auto">
                                            {compatibleMembers.map(m => {
                                                const checked = responsibleIds.includes(m.user_id);
                                                const tn = memberShiftNames(m.user_id);
                                                return (
                                                    <label key={m.user_id} className="flex items-center gap-2.5 cursor-pointer text-sm text-white py-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => setResponsibleIds(checked
                                                                ? responsibleIds.filter(id => id !== m.user_id)
                                                                : [...responsibleIds, m.user_id])}
                                                            className="w-4 h-4 accent-[#13b6ec] shrink-0"
                                                        />
                                                        <span className="truncate">
                                                            {m.name}
                                                            <span className="text-[#92bbc9]"> · {memberAreaLabel(m.user_id) || 'Sem área'}</span>
                                                            {tn.length > 0 && <span className="text-[#5a8a9a] text-xs"> — {tn.join(', ')}</span>}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                            {incompatibleMembers.map(m => {
                                                const tn = memberShiftNames(m.user_id);
                                                return (
                                                    <label key={m.user_id} className="flex items-center gap-2.5 text-sm text-[#5a8a9a] py-1 cursor-not-allowed">
                                                        <input type="checkbox" checked={false} disabled className="w-4 h-4 shrink-0" />
                                                        <span className="truncate">
                                                            🔒 {m.name} — {tn.length > 0 ? `Turnos: ${tn.join(', ')}` : 'Sem turno vinculado'}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* Aviso: turnos específicos + existem incompatíveis nas áreas */}
                                    {shiftIds.length > 0 && incompatibleMembers.length > 0 && (
                                        <p className="text-xs text-amber-400 mt-1.5 flex items-start gap-1">
                                            <span className="material-symbols-outlined text-[14px] shrink-0">lock</span>
                                            {incompatibleMembers.length} colaborador{incompatibleMembers.length > 1 ? 'es' : ''} não pertence{incompatibleMembers.length > 1 ? 'm' : ''} aos turnos selecionados ({selectedShiftLabel}) e não pode{incompatibleMembers.length > 1 ? 'm' : ''} ser atribuído{incompatibleMembers.length > 1 ? 's' : ''}.
                                        </p>
                                    )}
                                    {responsibleIds.length === 0 && (
                                        <p className="text-xs text-amber-400 mt-1.5">Selecione ao menos um colaborador para continuar.</p>
                                    )}
                                    {responsibleIds.length > 0 && (
                                        <p className="text-xs text-[#92bbc9] mt-1.5">
                                            Apenas {responsibleIds.length === 1 ? 'este colaborador verá' : `estes ${responsibleIds.length} colaboradores verão`} esta rotina no turno.
                                        </p>
                                    )}
                                    {areaIds.length > 0 && filteredEquipe.length === 0 && (
                                        <p className="text-xs text-amber-400 mt-1.5">
                                            Nenhum colaborador vinculado {areaIds.length > 1 ? 'às áreas selecionadas' : 'a esta área'}. Adicione colaboradores na tela de Equipe.
                                        </p>
                                    )}
                                    {areaIds.length > 0 && shiftIds.length > 0 && filteredEquipe.length > 0 && compatibleMembers.length === 0 && (
                                        <p className="text-xs text-amber-400 mt-1.5">
                                            Nenhum colaborador {areaIds.length > 1 ? 'das áreas selecionadas' : 'da área'} pertence aos turnos selecionados ({selectedShiftLabel}). Vincule colaboradores a esses turnos na tela de Equipe.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-[#92bbc9]">
                                    Todos os colaboradores {areaIds.length > 1 ? 'das áreas selecionadas' : 'da área'} terão acesso a esta rotina.
                                </p>
                            )}
                        </div>

                        {/* Sprint 48: "Obrigatório" e "Ordem Sequencial" não fazem sentido
                            para recebimento (não é pendência operacional automática). */}
                        {!isReceiving && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="flex items-center gap-3 p-3 bg-[#16262c] border border-[#233f48] rounded-xl">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={isRequired}
                                            onChange={(e) => setIsRequired(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                                    </label>
                                    <div>
                                        <h4 className="text-white text-sm font-bold">Obrigatório</h4>
                                        <p className="text-[#92bbc9] text-xs">Exigir conclusão no painel de turno</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-[#16262c] border border-[#233f48] rounded-xl">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={enforceSequentialOrder}
                                            onChange={(e) => setEnforceSequentialOrder(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                                    </label>
                                    <div>
                                        <h4 className="text-white text-sm font-bold">Ordem Sequencial</h4>
                                        <p className="text-[#92bbc9] text-xs">Concluir uma a uma nesta ordem</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Seção: Janela de Horário */}
                    <div className="bg-[#101d22] border border-[#233f48] rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-white font-bold text-sm">{isReceiving ? 'Janela esperada de chegada' : 'Janela de Horário'}</h3>
                                <p className="text-[#92bbc9] text-xs mt-0.5">{isReceiving ? 'Horário em que o recebimento normalmente acontece' : 'Define quando a atividade fica disponível'}</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={hasTimeWindow}
                                    onChange={(e) => setHasTimeWindow(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-[#233f48] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></div>
                            </label>
                        </div>

                        {hasTimeWindow && (
                            <div className="space-y-4 pt-2">
                                {/* Alternância: definir o fim por horário final ou por duração */}
                                <div className="inline-flex w-full sm:w-auto rounded-xl border border-[#233f48] bg-[#16262c] p-1">
                                    <button
                                        type="button"
                                        onClick={() => setEndMode("time")}
                                        className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${endMode === "time" ? "bg-[#13b6ec] text-[#0a1215]" : "text-[#92bbc9] hover:text-white"}`}
                                    >
                                        Horário final
                                    </button>
                                    <button
                                        type="button"
                                        onClick={switchToDurationMode}
                                        className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${endMode === "duration" ? "bg-[#13b6ec] text-[#0a1215]" : "text-[#92bbc9] hover:text-white"}`}
                                    >
                                        Duração
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Início</label>
                                        <input
                                            type="time"
                                            value={startTime}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setStartTime(v);
                                                if (endMode === "duration") recalcEndFromDuration(v, durationHours, durationMins);
                                            }}
                                            className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                                        />
                                    </div>

                                    {endMode === "time" ? (
                                        <div>
                                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Fim</label>
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-4 py-3 text-white focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-xs font-bold text-[#92bbc9] uppercase tracking-wider mb-2">Duração</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={23}
                                                    inputMode="numeric"
                                                    placeholder="0"
                                                    value={durationHours}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setDurationHours(v);
                                                        recalcEndFromDuration(startTime, v, durationMins);
                                                    }}
                                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-3 py-3 text-white text-center focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                                                />
                                                <span className="text-[#92bbc9] text-sm shrink-0">h</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={59}
                                                    inputMode="numeric"
                                                    placeholder="00"
                                                    value={durationMins}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setDurationMins(v);
                                                        recalcEndFromDuration(startTime, durationHours, v);
                                                    }}
                                                    className="w-full bg-[#16262c] border border-[#233f48] rounded-xl px-3 py-3 text-white text-center focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] outline-none transition-all"
                                                />
                                                <span className="text-[#92bbc9] text-sm shrink-0">min</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Informativos */}
                                    <div className="col-span-2 space-y-1">
                                        {endMode === "duration" && endTime && (
                                            <p className="text-[#92bbc9] text-xs">
                                                Fim calculado: <span className="text-white font-medium">{endTime}</span>
                                            </p>
                                        )}
                                        {timeWindowInvalid ? (
                                            <p className="text-red-400 text-xs font-medium flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">error</span>
                                                O horário de término deve ser maior que o horário de início.
                                            </p>
                                        ) : availableMinutes !== null ? (
                                            <p className="text-[#13b6ec] text-xs font-medium">
                                                Tempo disponível para execução: {formatDuration(availableMinutes)}
                                            </p>
                                        ) : endMode === "duration" && (durationHours || durationMins) && !startTime ? (
                                            <p className="text-[#92bbc9] text-xs">Defina o horário de início para calcular o fim.</p>
                                        ) : null}
                                    </div>

                                    {shiftEndWarning && (
                                        <div className="col-span-2 flex items-start gap-2 px-3 py-2 bg-amber-400/10 border border-amber-400/30 rounded-lg">
                                            <span className="material-symbols-outlined text-amber-400 text-[16px] shrink-0 mt-0.5">warning</span>
                                            <p className="text-amber-400 text-xs">
                                                O horário de conclusão ({shiftEndWarning.endTime}) ultrapassa o fim dos turnos selecionados ({shiftEndWarning.shiftNames}). Você pode continuar mesmo assim.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Sprint 76: permitir iniciar antes do horário de início */}
                                <div className="bg-[#16262c] border border-[#233f48] rounded-xl p-4">
                                    <label className="flex items-start justify-between gap-3 cursor-pointer">
                                        <div>
                                            <p className="text-white text-sm font-bold">Permitir iniciar antes do horário</p>
                                            {allowEarlyStart && (
                                                <p className="text-[#92bbc9] text-xs mt-1">
                                                    Colaboradores podem iniciar esta rotina antes do horário configurado.
                                                </p>
                                            )}
                                        </div>
                                        <span className="relative inline-flex items-center shrink-0 mt-0.5">
                                            <input
                                                type="checkbox"
                                                checked={allowEarlyStart}
                                                onChange={(e) => setAllowEarlyStart(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-[#233f48] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13b6ec]"></span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    </div>{/* /Coluna esquerda */}

                    {/* Coluna direita — Tarefas (sticky header + DnD) */}
                    <div className="px-6 pb-6 space-y-3 bg-[#101d22]/30 md:bg-transparent">
                        <div className="sticky top-0 z-10 -mx-6 px-6 py-4 bg-[#101d22] border-b border-[#233f48] flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Tarefas da Rotina ({tasks.length})</h3>
                            <div className="flex items-center gap-2">
                                {!disableReorder && isMobile && tasks.length > 1 && (
                                    <button
                                        onClick={() => setIsReorderMode(prev => !prev)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            isReorderMode
                                                ? "bg-[#13b6ec]/20 text-[#13b6ec] border border-[#13b6ec]/40"
                                                : "bg-[#16262c] text-[#92bbc9] border border-[#233f48]"
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">
                                            {isReorderMode ? "check" : "swap_vert"}
                                        </span>
                                        {isReorderMode ? "Concluir" : "Reordenar"}
                                    </button>
                                )}
                                <button
                                    onClick={() => addTask()}
                                    className="flex items-center gap-1.5 text-sm font-bold text-[#13b6ec] hover:text-[#10a0d0] px-3 py-1.5 rounded-lg hover:bg-[#13b6ec]/10 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                    Adicionar Tarefa
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3 pt-3">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragCancel={() => {}}>
                                <SortableContext items={tasks.map(t => t.tempId)} strategy={verticalListSortingStrategy}>
                                    {tasks.map((task, index) => (
                                        <TaskItem
                                            key={task.tempId}
                                            task={task}
                                            equipe={equipe}
                                            onUpdate={updateTask}
                                            onRemove={removeTask}
                                            onEnter={() => addTask(task.tempId)}
                                            setInputRef={(el) => { taskInputRefs.current[task.tempId] = el; }}
                                            disableReorder={disableReorder}
                                            isReorderMode={isReorderMode}
                                            isFirst={index === 0}
                                            isLast={index === tasks.length - 1}
                                            onMoveUp={() => performTaskReorder(index, index - 1)}
                                            onMoveDown={() => performTaskReorder(index, index + 1)}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>

                            {tasks.length === 0 && (
                                <div className="text-center p-8 border border-dashed border-[#325a67] rounded-xl text-[#92bbc9]">
                                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">list_alt</span>
                                    <p className="text-sm">Nenhuma tarefa adicionada.</p>
                                    <p className="text-xs mt-1">Comece clicando em &quot;Adicionar Tarefa&quot; acima.</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Modal de Recorrência Personalizada (rrule) — não foi alterado */}
            {showRecurrencePicker && (
                <RecurrencePicker
                    // Só pré-popula se o estado atual é v1 legacy (tem `frequency`).
                    // Configs v2 abrem o picker com defaults limpos — admin re-configura.
                    initial={
                        recurrenceConfig &&
                        typeof recurrenceConfig === 'object' &&
                        'frequency' in recurrenceConfig
                            ? (recurrenceConfig as RecurrenceConfig)
                            : undefined
                    }
                    onConfirm={(config) => {
                        setRecurrenceConfig(config);
                        setRecurrence('custom');
                        setShowRecurrencePicker(false);
                    }}
                    onCancel={() => {
                        setShowRecurrencePicker(false);
                    }}
                />
            )}

            {/* PR 4: Modais de configuração v2 (daily/weekly/monthly/yearly) */}
            {activeRecurrenceModal === 'daily' && (
                <DailyConfig
                    initialExcluded={
                        recurrenceConfig &&
                        typeof recurrenceConfig === 'object' &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === 'weekly'
                            ? [0, 1, 2, 3, 4, 5, 6].filter(
                                d => !((recurrenceConfig as RecurrenceV2 & { type: 'weekly' }).weekdays.includes(d))
                            )
                            : []
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift}
                />
            )}

            {activeRecurrenceModal === 'weekly' && (
                <WeeklyConfig
                    initialWeekdays={
                        recurrenceConfig &&
                        typeof recurrenceConfig === 'object' &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === 'weekly'
                            ? (recurrenceConfig as RecurrenceV2 & { type: 'weekly' }).weekdays
                            : undefined
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift}
                />
            )}

            {activeRecurrenceModal === 'monthly' && (
                <MonthlyConfig
                    initial={
                        recurrenceConfig &&
                        typeof recurrenceConfig === 'object' &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === 'monthly'
                            ? (recurrenceConfig as RecurrenceV2 & { type: 'monthly' })
                            : undefined
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift}
                />
            )}

            {activeRecurrenceModal === 'yearly' && (
                <YearlyConfig
                    initial={
                        recurrenceConfig &&
                        typeof recurrenceConfig === 'object' &&
                        (recurrenceConfig as { version?: unknown }).version === 2 &&
                        (recurrenceConfig as RecurrenceV2).type === 'yearly'
                            ? (recurrenceConfig as RecurrenceV2 & { type: 'yearly' })
                            : undefined
                    }
                    onConfirm={handleModalConfirm}
                    onCancel={() => setActiveRecurrenceModal(null)}
                    shifts={shiftsData}
                    shiftLabel={shift}
                />
            )}

            {/* Modal de Arquivamento */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-[#16262c] border border-[#233f48] rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-fade-in">
                        <div className="flex items-center gap-3 mb-2 text-white">
                            <span className="material-symbols-outlined text-red-500">archive</span>
                            <h3 className="text-xl font-bold tracking-tight">Arquivar rotina?</h3>
                        </div>
                        <p className="text-[#92bbc9] text-sm mb-6 mt-2 leading-relaxed">
                            Esta ação desativará a lista para futuros turnos. Ela não será completamente deletada,
                            mantendo o histórico existente.
                        </p>
                        <div className="flex gap-3 justify-end mt-4">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 rounded-lg font-bold text-sm text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors"
                                disabled={deleteMutation.isPending}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteMutation.isPending}
                                className="px-4 py-2 rounded-lg font-bold text-sm bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                            >
                                {deleteMutation.isPending ? "Arquivando..." : "Confirmar Arquivamento"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sprint 92 — remover uma área tira do escopo os responsáveis que só
                pertenciam a ela. Confirmação explícita antes de aplicar. */}
            {pendingAreaRemoval && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-[#16262c] border border-[#233f48] rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-fade-in">
                        <div className="flex items-center gap-3 mb-2 text-white">
                            <span className="material-symbols-outlined text-amber-400">group_remove</span>
                            <h3 className="text-xl font-bold tracking-tight">Remover {pendingAreaRemoval.areaName}?</h3>
                        </div>
                        <p className="text-[#92bbc9] text-sm mb-4 mt-2 leading-relaxed">
                            {pendingAreaRemoval.affected.length === 1
                                ? 'Este responsável não pertence a nenhuma outra área selecionada e será removido da rotina:'
                                : 'Estes responsáveis não pertencem a nenhuma outra área selecionada e serão removidos da rotina:'}
                        </p>
                        <ul className="mb-6 space-y-1">
                            {pendingAreaRemoval.affected.map((a) => (
                                <li key={a.user_id} className="text-sm text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px] text-[#5a8a9a]">person</span>
                                    {a.name}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-3 justify-end mt-4">
                            <button
                                onClick={() => setPendingAreaRemoval(null)}
                                className="px-4 py-2 rounded-lg font-bold text-sm text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmAreaRemoval}
                                className="px-4 py-2 rounded-lg font-bold text-sm bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-white transition-colors"
                            >
                                Remover mesmo assim
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
