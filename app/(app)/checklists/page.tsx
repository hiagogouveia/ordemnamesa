"use client";

import { useState, useMemo, useCallback, Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { useChecklists, useCreateChecklist, useDeleteChecklist, useToggleChecklistStatus } from "@/lib/hooks/use-checklists";
import { useChecklistById } from "@/lib/hooks/use-checklist-by-id";
import { useTenantFromUrl } from "@/lib/hooks/use-tenant-from-url";
import { useNotificationNavigator, NOTIFICATION_ACK_PARAM } from "@/lib/notifications/navigator";
import type { ChecklistPanelTab } from "@/lib/notifications/navigation";
import { DeepLinkFallback } from "@/components/checklists/management/DeepLinkFallback";
import { useIssueCountsByChecklist } from "@/lib/hooks/use-task-issues";
import { useShifts } from "@/lib/hooks/use-shifts";
import { shouldChecklistAppearToday } from "@/lib/utils/should-checklist-appear-today";
import { useRestaurantNow } from "@/lib/hooks/use-restaurant-now";
import { BulkActionBar } from "@/components/checklists/management/BulkActionBar";
// Code-splitting: modal só é montado quando aberto.
const CopyChecklistModal = dynamic(
    () => import("@/components/checklists/management/CopyChecklistModal").then((m) => ({ default: m.CopyChecklistModal })),
    { loading: () => null }
);
const TemporaryTransferModal = dynamic(
    () => import("@/components/checklists/management/TemporaryTransferModal").then((m) => ({ default: m.TemporaryTransferModal })),
    { ssr: false }
);
const TransferResponsibleModal = dynamic(
    () => import("@/components/checklists/management/TransferResponsibleModal").then((m) => ({ default: m.TransferResponsibleModal })),
    { loading: () => null }
);
import { useChecklistOrders, useUpdateChecklistOrders } from "@/lib/hooks/use-checklist-orders";
import { createClient } from "@/lib/supabase/client";
import { useAllAreas } from "@/lib/hooks/use-areas";
import { useEquipe } from "@/lib/hooks/use-equipe";
import { useUnits } from "@/lib/hooks/use-units";
import { useAccountAccess } from "@/lib/hooks/use-account-access";
import { useBilling } from "@/lib/hooks/use-billing";
import { useExportRotinasPdf } from "@/lib/hooks/use-export-rotinas-pdf";
import { useSession } from "@/lib/providers/use-session";
import { ChecklistHeader } from "@/components/checklists/management/ChecklistHeader";
import { ChecklistFilters } from "@/components/checklists/management/ChecklistFilters";
import { ChecklistListView } from "@/components/checklists/management/ChecklistListView";
// Code-splitting: views não-default (board/preview), painel e modais não entram
// no bundle inicial — só carregam quando realmente usados. Board e Form puxam
// libs pesadas (dnd-kit / lodash) que não são necessárias no primeiro paint.
const ChecklistBoardView = dynamic(
    () => import("@/components/checklists/management/ChecklistBoardView").then((m) => ({ default: m.ChecklistBoardView }))
);
const ChecklistEditorPanel = dynamic(
    () => import("@/components/checklists/management/ChecklistEditorPanel").then((m) => ({ default: m.ChecklistEditorPanel }))
);
const ChecklistPreviewView = dynamic(
    () => import("@/components/checklists/management/ChecklistPreviewView").then((m) => ({ default: m.ChecklistPreviewView }))
);
const ChecklistForm = dynamic(
    () => import("@/components/checklists/checklist-form").then((m) => ({ default: m.ChecklistForm })),
    { loading: () => null }
);
const TemplatesBrowserModal = dynamic(
    () => import("@/components/checklists/templates/TemplatesBrowserModal").then((m) => ({ default: m.TemplatesBrowserModal })),
    { loading: () => null }
);
import { Modal } from "@/components/ui/modal";
import { filterChecklistsByCollaborator, type AssignmentOrigin } from "@/lib/utils/filter-checklists-by-collaborator";
import { getDirectAssignmentGroup, getEligibleTransferTargets } from "@/lib/utils/transfer-responsible";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import { getOperationalStatus } from "@/lib/utils/get-operational-status";
import type { ChecklistOrder, ChecklistTemplate, ExecutionStatus, PriorityMode } from "@/lib/types";

type SortField = "name" | "shift" | "area" | "responsible" | "status";
type SortOrder = "asc" | "desc";

type EditorState = {
    checklist: ExtendedChecklist | null;
    mode: "view" | "edit" | "new";
} | null;

const SHIFT_SORT_ORDER: Record<string, number> = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    any: 3,
};

function ChecklistsContent() {
    // ─── ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURN ───────────────────────

    const searchParams = useSearchParams();
    const router = useRouter();

    // Sprint 73 — "agora" no fuso do restaurante (fonte única)
    const { currentMinutes, dayOfWeek: tzDayOfWeek, dateKey: tzDateKey } = useRestaurantNow();

    // UI state
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [editorState, setEditorState] = useState<EditorState>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    // Sprint 70 — Modelos de Rotinas Prontas
    const [templatesBrowserOpen, setTemplatesBrowserOpen] = useState(false);
    const [pendingTemplate, setPendingTemplate] = useState<ChecklistTemplate | null>(null);
    // Sprint 75 — feedback transitório da exclusão (sucesso/erro)
    const [deleteToast, setDeleteToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
    // Atualização manual da tela (refresh sem reload da página)
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Auto-dismiss do toast de exclusão
    useEffect(() => {
        if (!deleteToast) return;
        const t = setTimeout(() => setDeleteToast(null), 4000);
        return () => clearTimeout(t);
    }, [deleteToast]);

    const focusIssueId = searchParams.get("issue");
    // Deep-link: abre o painel da rotina informada. Vem do Dashboard e das notificações.
    const deepLinkChecklistId = searchParams.get("openId");
    // s90 — token do handshake de leitura: a notificação só é marcada como lida quando
    // ESTA página confirma que reconstruiu o contexto.
    const notificationKey = searchParams.get(NOTIFICATION_ACK_PARAM);
    // Escopo TEMPORAL do painel. É este param que destrava as ocorrências históricas —
    // antes o painel era hardcoded em "hoje" e uma ocorrência de ontem era inalcançável.
    const deepLinkDateKey = searchParams.get("date_key");
    const rawTab = searchParams.get("tab");
    const deepLinkTab: ChecklistPanelTab | null =
        rawTab === "issues" || rawTab === "tasks" || rawTab === "history" ? rawTab : null;

    // s90 — o modo de visualização passa a ser endereçável por URL. Antes era `useState`
    // puro: o deep-link não conseguia forçar o modo Cards, e o link não era compartilhável.
    const rawView = searchParams.get("view");
    const view: "list" | "board" | "preview" =
        rawView === "board" || rawView === "preview" || rawView === "list" ? rawView : "list";
    const selectedShift = searchParams.get("shift") ?? "";
    const selectedAreaId = searchParams.get("area_id") ?? "";
    // Compat: URLs antigos com ?availability=draft caem em "active" (sem-op)
    const rawAvailability = searchParams.get("availability") ?? "active";
    const selectedAvailability = rawAvailability === "draft" ? "active" : rawAvailability;
    const selectedExecStatus = searchParams.get("exec_status") ?? "";
    const rawType = searchParams.get("type") ?? "all";
    // s61: filtro agora reflete tipos operacionais explícitos. URLs antigas
    // (?type=operational | ?type=receiving) caem em "all" graciosamente.
    const selectedType: "all" | "regular" | "opening" | "closing" =
        rawType === "regular" || rawType === "opening" || rawType === "closing"
            ? rawType : "all";
    const selectedCollaboratorId = searchParams.get("collaborator_id") ?? "";
    // Origem da atribuição — só tem efeito quando há colaborador selecionado.
    // Valores inválidos (URLs antigas/manuais) caem em "all" graciosamente.
    const rawAssignmentOrigin = searchParams.get("assignment_origin") ?? "all";
    const selectedAssignmentOrigin: AssignmentOrigin =
        rawAssignmentOrigin === "direct" || rawAssignmentOrigin === "area"
            ? rawAssignmentOrigin : "all";
    const selectedUnitId = searchParams.get("unit_id") ?? "";
    const sortField = (searchParams.get("sort") as SortField | null) ?? null;
    const sortOrder = (searchParams.get("order") as SortOrder | null) ?? "asc";
    const queryClient = useQueryClient();

    // s90 — adota o tenant vindo da URL (?restaurant_id=), validando a pertinência
    // contra /api/my-restaurants. Sem isto, um link de notificação aberto em ABA NOVA
    // (o caso normal) chegava sem tenant — o restaurant_id só existia em sessionStorage —
    // e o deep-link morria em silêncio. A URL é um PEDIDO, nunca uma autoridade.
    const tenantAdoption = useTenantFromUrl();

    // Store
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const userRole = useRestaurantStore((state) => state.userRole);
    const restaurantName = useRestaurantStore((state) => state.restaurantName);
    const session = useSession();
    const accountId = useAccountSessionStore((state) => state.accountId);
    const accountMode = useAccountSessionStore((state) => state.mode);
    const isGlobal = accountMode === "global";

    // Queries
    const { data: accountAccess } = useAccountAccess(isGlobal ? accountId : undefined);
    const { data: billing } = useBilling();
    const { data: checklists = [], isLoading } = useChecklists(
        isGlobal
            ? { restaurantId: null, accountId, mode: 'global' }
            : (restaurantId ?? undefined)
    );
    const { data: orders = [] } = useChecklistOrders(restaurantId ?? undefined);
    const { data: areas = [], isLoading: isLoadingAreas } = useAllAreas(restaurantId ?? undefined);
    const { data: shifts = [] } = useShifts(restaurantId ?? undefined);
    // Sprint 73 — contexto p/ status recorrência-aware (fuso do restaurante)
    const statusCtx = useMemo(
        () => ({ dayOfWeek: tzDayOfWeek, dateKey: tzDateKey, shifts }),
        [tzDayOfWeek, tzDateKey, shifts]
    );
    const { data: equipeData } = useEquipe(
        isGlobal
            ? { restaurantId: null, accountId, mode: 'global' }
            : (restaurantId ?? null)
    );
    const { data: issueCounts = {} } = useIssueCountsByChecklist(restaurantId ?? undefined, tzDateKey);
    const { data: units = [] } = useUnits(isGlobal ? accountId : null);

    // ─── DEEP-LINK DETERMINÍSTICO (s90) ─────────────────────────────────────────
    //
    // ANTES: `checklists.find(c => c.id === openId)` — buscava na lista JÁ CARREGADA em
    // memória. Se a rotina não estivesse lá (filtro ativo a escondeu, rotina inativa,
    // lista ainda carregando, tenant errado), o deep-link falhava EM SILÊNCIO: nenhum
    // painel, nenhum aviso — e o efeito ainda APAGAVA o `openId` da URL, tornando o link
    // não-recarregável e destruindo a única pista do que deu errado.
    //
    // AGORA: carrega POR ID, direto da API. A rotina abre independentemente de qualquer
    // filtro ativo, e o `openId` PERMANECE na URL (link recarregável e compartilhável).
    // O guard por `useRef` some junto: um fluxo dirigido por URL é idempotente por
    // natureza, e o ref impedia que um segundo deep-link abrisse na mesma sessão.
    const {
        data: deepLinkChecklist,
        error: deepLinkError,
        isLoading: isDeepLinkLoading,
    } = useChecklistById(restaurantId ?? undefined, deepLinkChecklistId);

    useEffect(() => {
        if (!deepLinkChecklistId || !deepLinkChecklist) return;
        setEditorState((prev) => {
            // Não reabre se o usuário já está com este painel aberto (evita loop de render).
            if (prev?.mode === "view" && prev.checklist?.id === deepLinkChecklistId) return prev;
            return { checklist: deepLinkChecklist as ExtendedChecklist, mode: "view" };
        });
    }, [deepLinkChecklistId, deepLinkChecklist]);

    // ── Handshake de leitura (causal, sem timeout) ──────────────────────────────
    // A notificação só é marcada como lida quando ESTA PÁGINA confirma que reconstruiu
    // o contexto. Se a rotina foi excluída ou o acesso é negado, `fail()` — e a
    // notificação PERMANECE não-lida, porque o gestor não chegou ao assunto.
    const { ack, fail } = useNotificationNavigator();

    useEffect(() => {
        if (!notificationKey) return;
        if (tenantAdoption.status === "denied") {
            fail(notificationKey, "tenant_denied");
            return;
        }
        if (deepLinkError) {
            fail(notificationKey, deepLinkError.code === "NO_ACCESS" ? "no_access" : "not_found");
            return;
        }
        if (deepLinkChecklist) ack(notificationKey);
    }, [notificationKey, deepLinkChecklist, deepLinkError, tenantAdoption.status, ack, fail]);

    // Mutations
    const { mutate: toggleStatus } = useToggleChecklistStatus();
    const { mutate: deleteChecklist } = useDeleteChecklist();
    const { mutate: createChecklist } = useCreateChecklist();
    const { mutateAsync: updateOrders } = useUpdateChecklistOrders();

    // Derived: priority_mode for the selected area
    const selectedAreaPriorityMode: PriorityMode = useMemo(() => {
        if (!selectedAreaId) return "auto";
        const area = areas.find((a) => a.id === selectedAreaId);
        return area?.priority_mode ?? "auto";
    }, [selectedAreaId, areas]);

    // Derived: filtered + sorted list (MUST be before any conditional return)
    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();

        // Aplicar filtro por colaborador usando função pura (fonte de verdade)
        const collaboratorFiltered = selectedCollaboratorId
            ? filterChecklistsByCollaborator(
                checklists as ExtendedChecklist[],
                selectedCollaboratorId,
                equipeData?.equipe ?? [],
                selectedAssignmentOrigin
            ) as ExtendedChecklist[]
            : checklists as ExtendedChecklist[];

        // "Hoje": só rotinas ativas e que devem aparecer hoje pelas regras de recorrência.
        // Sprint 73 — usa o fuso do restaurante (não o do navegador).
        const brazilNow = selectedAvailability === "today" ? { dayOfWeek: tzDayOfWeek, dateKey: tzDateKey } : null;

        const result = collaboratorFiltered.filter((c) => {
            if (q && !c.name.toLowerCase().includes(q)) return false;
            if (isGlobal && selectedUnitId && c.restaurant_id !== selectedUnitId) return false;
            if (selectedShift && c.shift !== selectedShift && c.shift !== "any") return false;
            // s92: a rotina pode ter várias áreas — o filtro casa por interseção.
            if (selectedAreaId) {
                const ids = c.area_ids?.length ? c.area_ids : (c.area_id ? [c.area_id] : []);
                if (!ids.includes(selectedAreaId)) return false;
            }
            // s61: filtro Tipo passou a refletir tipos operacionais explícitos
            // (regular/opening/closing). "all" mostra tudo, incluindo eventuais
            // legados com type=receiving que ainda existam — visibilidade
            // preservada por design (sem perda de histórico).
            // Para 'regular', registros sem checklist_type definido (legados anteriores
            // à coluna existir) contam como regulares.
            if (selectedType === "regular" && c.checklist_type && c.checklist_type !== "regular") return false;
            if (selectedType === "opening" && c.checklist_type !== "opening") return false;
            if (selectedType === "closing" && c.checklist_type !== "closing") return false;
            if (selectedAvailability === "active" && !c.active) return false;
            if (selectedAvailability === "inactive" && c.active) return false;
            if (selectedAvailability === "today" && brazilNow) {
                if (!c.active) return false;
                if (!shouldChecklistAppearToday(c, brazilNow.dayOfWeek, brazilNow.dateKey, shifts)) return false;
            }

            // Filtro por status de execução (recorrência-aware)
            if (selectedExecStatus) {
                const computed = getOperationalStatus(c, currentMinutes, statusCtx);
                if (computed !== selectedExecStatus) return false;
            }

            return true;
        });

        // Sempre ordenar por order_index como base
        if (!sortField) {
            return [...result].sort((a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999));
        }

        const sortedResult = [...result].sort((a, b) => {
            let valA: string | number;
            let valB: string | number;

            switch (sortField) {
                case "name":
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    break;
                case "shift":
                    valA = SHIFT_SORT_ORDER[a.shift] ?? 99;
                    valB = SHIFT_SORT_ORDER[b.shift] ?? 99;
                    break;
                case "area":
                    // s92: ordena pela primeira área (as listas já vêm por nome).
                    valA = (a.areas_list?.[0]?.name || a.area?.name || "\uffff").toLowerCase();
                    valB = (b.areas_list?.[0]?.name || b.area?.name || "\uffff").toLowerCase();
                    break;
                case "responsible":
                    // s92: ordena pelo primeiro responsável (as listas já vêm por nome).
                    valA = (a.responsibles?.[0]?.name ?? a.responsible?.name)?.toLowerCase() ?? "\uffff";
                    valB = (b.responsibles?.[0]?.name ?? b.responsible?.name)?.toLowerCase() ?? "\uffff";
                    break;
                case "status":
                    valA = !a.active ? 1 : 0;
                    valB = !b.active ? 1 : 0;
                    break;
                default:
                    return 0;
            }

            const mult = sortOrder === "asc" ? 1 : -1;
            if (valA < valB) return -1 * mult;
            if (valA > valB) return 1 * mult;
            // Tiebreaker: order_index
            return (a.order_index ?? 9999) - (b.order_index ?? 9999);
        });
        
        return sortedResult;
    }, [checklists, searchQuery, selectedShift, selectedAreaId, selectedAvailability, selectedExecStatus, selectedType, selectedCollaboratorId, selectedAssignmentOrigin, selectedUnitId, isGlobal, equipeData, shifts, currentMinutes, tzDayOfWeek, tzDateKey, statusCtx, sortField, sortOrder]);

    // ─── BULK SELECTION (visão global) ─────────────────────────────────────────

    // No modo global, userRole (restaurant-store) é null — usar role da account
    const effectiveRole = isGlobal ? accountAccess?.role : userRole;
    const isManagerOrOwner = effectiveRole === "owner" || effectiveRole === "manager";
    // Seleção disponível para owner/manager em qualquer visão (única ou global).
    const canSelect = isManagerOrOwner;
    // Copiar entre unidades só faz sentido (e só é permitido) na visão global.
    const canBulkAction = isGlobal && isManagerOrOwner;

    const selectedChecklists = useMemo(
        () => filtered.filter((c) => selectedIds.has(c.id)),
        [filtered, selectedIds]
    );

    // ─── TRANSFERIR RESPONSÁVEL ─────────────────────────────────────────────────
    // Só na visão de unidade única (mesma área/colaboradores são por restaurante).
    const canTransfer = !isGlobal && isManagerOrOwner && selectedChecklists.length > 0;
    const transferGroup = useMemo(
        () => getDirectAssignmentGroup(selectedChecklists),
        [selectedChecklists]
    );
    const transferEligibleTargets = useMemo(() => {
        if (!transferGroup.ok || !transferGroup.areaIds?.length || !transferGroup.sourceUserId) return [];
        return getEligibleTransferTargets(
            equipeData?.equipe ?? [],
            transferGroup.areaIds,
            transferGroup.sourceUserId
        );
    }, [transferGroup, equipeData]);
    const transferDisabledReason = !transferGroup.ok
        ? transferGroup.reason
        : transferEligibleTargets.length === 0
            ? "Não há outro colaborador ativo nesta área."
            : undefined;

    // ─── s94: TRANSFERIR TEMPORARIAMENTE ────────────────────────────────────────
    // Ação por rotina (menu de 3 pontinhos), não em massa. Mesma restrição da
    // transferência permanente: só na visão de unidade única, porque áreas, turnos e
    // colaboradores são por restaurante — na Visão Global não existe "a equipe".
    const canTemporaryTransfer = !isGlobal && isManagerOrOwner && !!restaurantId;
    const [temporaryTransferTarget, setTemporaryTransferTarget] =
        useState<ExtendedChecklist | null>(null);

    // ─── EXPORTAÇÃO PARA PDF ────────────────────────────────────────────────────
    const { exportPdf, isExporting } = useExportRotinasPdf({
        onSuccess: (count) =>
            setDeleteToast({
                kind: "success",
                message:
                    count === 1
                        ? "PDF da rotina gerado com sucesso."
                        : `PDF com ${count} rotinas gerado com sucesso.`,
            }),
        onError: (message) => setDeleteToast({ kind: "error", message }),
    });

    const handleExportPdf = useCallback(() => {
        const exportName =
            session.restaurant?.name ?? restaurantName ?? session.account?.name ?? "Restaurante";
        void exportPdf({
            checklists: selectedChecklists,
            restaurantName: exportName,
            exportedBy: session.userName ?? "—",
            restaurantId: isGlobal ? null : restaurantId,
        });
    }, [exportPdf, selectedChecklists, session, restaurantName, isGlobal, restaurantId]);

    const sourceRestaurantIds = useMemo(
        () => [...new Set(selectedChecklists.map((c) => c.restaurant_id))],
        [selectedChecklists]
    );

    // Limpar seleção quando filtros mudam
    useEffect(() => {
        setSelectedIds(new Set());
    }, [selectedShift, selectedAreaId, selectedAvailability, selectedExecStatus, selectedType, selectedCollaboratorId, selectedAssignmentOrigin, selectedUnitId, searchQuery]);

    const handleSelectionChange = (id: string, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectedIds(checked ? new Set(filtered.map((c) => c.id)) : new Set());
    };

    const handleCopyModalClose = useCallback(() => {
        setCopyModalOpen(false);
        setSelectedIds(new Set());
    }, []);

    // ─── URL HELPERS ────────────────────────────────────────────────────────────

    /**
     * s90 — qual estado de fallback mostrar no lugar do painel. `null` ⇒ painel normal.
     * Só entra em cena quando há um deep-link ativo (`openId` na URL).
     */
    const deepLinkFallbackKind = !deepLinkChecklistId
        ? null
        : tenantAdoption.status === "denied"
            ? ("TENANT_DENIED" as const)
            : deepLinkError
                ? deepLinkError.code
                : isDeepLinkLoading || tenantAdoption.status === "adopting"
                    ? ("LOADING" as const)
                    : null;

    /**
     * Fecha o painel E limpa os params do deep-link.
     *
     * O `openId` PERMANECE na URL enquanto o painel está aberto (é o que torna o link
     * recarregável e compartilhável — antes ele era apagado imediatamente). Só sai
     * quando o usuário fecha, para que o painel não reabra sozinho.
     */
    const closeDeepLink = () => {
        setEditorState(null);
        if (!deepLinkChecklistId && !notificationKey) return;
        const params = new URLSearchParams(searchParams.toString());
        for (const p of ["openId", "issue", "date_key", "assumption_id", "tab", NOTIFICATION_ACK_PARAM]) {
            params.delete(p);
        }
        const qs = params.toString();
        router.replace(`/checklists${qs ? `?${qs}` : ""}`, { scroll: false });
    };

    /** s90 — o modo vive na URL, para que o deep-link possa forçar "Cards" e o link seja compartilhável. */
    const setView = (next: "list" | "board" | "preview") => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === "list") params.delete("view"); // "list" é o default: não polui a URL
        else params.set("view", next);
        router.replace(`/checklists?${params.toString()}`, { scroll: false });
    };

    const setShiftFilter = (shift: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (shift) params.set("shift", shift);
        else params.delete("shift");
        router.replace(`/checklists?${params.toString()}`);
    };

    const setAreaFilter = (areaId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (areaId) params.set("area_id", areaId);
        else params.delete("area_id");
        router.replace(`/checklists?${params.toString()}`);
    };

    const setAvailabilityFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set("availability", value);
        else params.delete("availability");
        router.replace(`/checklists?${params.toString()}`);
    };

    const setExecStatusFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set("exec_status", value);
        else params.delete("exec_status");
        router.replace(`/checklists?${params.toString()}`);
    };

    const setTypeFilter = (value: "all" | "regular" | "opening" | "closing") => {
        const params = new URLSearchParams(searchParams.toString());
        if (value && value !== "all") params.set("type", value);
        else params.delete("type");
        router.replace(`/checklists?${params.toString()}`);
    };

    const setCollaboratorFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set("collaborator_id", value);
        else params.delete("collaborator_id");
        // Sem colaborador, a origem da atribuição é inerte — limpar para evitar
        // estado órfão na URL.
        if (!value) params.delete("assignment_origin");
        router.replace(`/checklists?${params.toString()}`);
    };

    const setAssignmentOriginFilter = (value: AssignmentOrigin) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value && value !== "all") params.set("assignment_origin", value);
        else params.delete("assignment_origin");
        router.replace(`/checklists?${params.toString()}`);
    };

    const setUnitFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set("unit_id", value);
        else params.delete("unit_id");
        router.replace(`/checklists?${params.toString()}`);
    };

    const handleSortChange = (field: SortField) => {
        const params = new URLSearchParams(searchParams.toString());
        if (sortField === field) {
            params.set("order", sortOrder === "asc" ? "desc" : "asc");
        } else {
            params.set("sort", field);
            params.set("order", "asc");
        }
        router.replace(`/checklists?${params.toString()}`);
    };

    // ─── CONDITIONAL RENDERS (after all hooks) ──────────────────────────────────

    if (userRole === "staff") {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-72px)] bg-[#0a1215] text-[#92bbc9] p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-4xl text-red-500">lock</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Acesso Negado</h2>
                <p className="max-w-md">
                    Sua função de Colaborador (Staff) não tem permissão para gerenciar as rotinas e checklists do
                    restaurante.
                </p>
            </div>
        );
    }

    // ─── HANDLERS ────────────────────────────────────────────────────────────────

    const handleSelect = (checklist: ExtendedChecklist) => {
        setEditorState({ checklist, mode: "view" });
    };

    const handleEdit = (checklist: ExtendedChecklist) => {
        setEditorState({ checklist, mode: "edit" });
    };

    const handleStatusToggle = (id: string, active: boolean) => {
        if (!restaurantId) return;
        toggleStatus({ id, restaurantId, active });
    };

    const handleDuplicate = (checklist: ExtendedChecklist) => {
        if (!restaurantId) return;
        createChecklist({
            ...checklist,
            id: undefined as unknown as string,
            name: `${checklist.name} (cópia)`,
            restaurant_id: restaurantId,
            tasks: checklist.tasks?.map((t) => ({
                ...t,
                id: undefined as unknown as string,
                checklist_id: undefined as unknown as string,
            })),
        });
    };

    const handleDelete = (id: string) => {
        if (!restaurantId) return;
        const checklist = checklists.find((c) => c.id === id);
        const nome = checklist?.name ? `"${checklist.name}"` : "Rotina";
        deleteChecklist(
            { id, restaurantId },
            {
                onSuccess: () => setDeleteToast({ kind: "success", message: `${nome} excluída com sucesso.` }),
                onError: (err: unknown) =>
                    setDeleteToast({
                        kind: "error",
                        message: err instanceof Error ? err.message : "Erro ao excluir a rotina.",
                    }),
            },
        );
    };

    const handleOrdersSave = async (newOrders: ChecklistOrder[]) => {
        if (!restaurantId) return;
        await updateOrders({
            restaurantId,
            orders: newOrders.map((o) => ({
                checklist_id: o.checklist_id,
                shift: o.shift,
                position: o.position,
            })),
        });
    };

    const handleReorder = async (items: Array<{ id: string; order_index: number }>) => {
        if (!restaurantId) return;
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Sessão expirada");

        const res = await fetch("/api/checklists/reorder", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                checklist_orders: items,
                area_id: selectedAreaId || undefined,
            }),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Erro ao reordenar");
        }

        queryClient.setQueryData(
            ["checklists", restaurantId],
            (old: ExtendedChecklist[] | undefined) => {
                if (!old) return old;
                const orderMap = new Map(items.map((i) => [i.id, i.order_index]));
                const updated = old.map((c) => {
                    const newIdx = orderMap.get(c.id);
                    return newIdx !== undefined ? { ...c, order_index: newIdx } : c;
                });
                return [...updated].sort((a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999));
            }
        );

        // Optimistic update: set area to manual mode
        if (selectedAreaId) {
            queryClient.setQueryData(
                ["areas-all", restaurantId],
                (old: typeof areas | undefined) => {
                    if (!old) return old;
                    return old.map((a) =>
                        a.id === selectedAreaId ? { ...a, priority_mode: "manual" as const } : a
                    );
                }
            );
        }
    };

    const handleAutoReprioritize = async () => {
        if (!restaurantId || !selectedAreaId) return;
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Sessão expirada");

        const res = await fetch("/api/checklists/auto-prioritize", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ restaurant_id: restaurantId, area_id: selectedAreaId }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Erro ao repriorizar");
        }

        const result = await res.json();

        // Update checklists cache with new order
        if (result.new_order) {
            queryClient.setQueryData(
                ["checklists", restaurantId],
                (old: ExtendedChecklist[] | undefined) => {
                    if (!old) return old;
                    const orderMap = new Map(
                        result.new_order.map((o: { id: string; order_index: number }) => [o.id, o.order_index])
                    );
                    const updated = old.map((c) => {
                        const newIdx = orderMap.get(c.id);
                        return newIdx !== undefined ? { ...c, order_index: newIdx } : c;
                    });
                    return [...updated].sort((a, b) => ((a.order_index as number) ?? 9999) - ((b.order_index as number) ?? 9999));
                }
            );
        }

        // Set area back to auto mode
        queryClient.setQueryData(
            ["areas-all", restaurantId],
            (old: typeof areas | undefined) => {
                if (!old) return old;
                return old.map((a) =>
                    a.id === selectedAreaId ? { ...a, priority_mode: "auto" as const } : a
                );
            }
        );
    };

    const handleEditorSaved = () => {
        setEditorState(null);
        setPendingTemplate(null);
    };

    const closeEditor = () => {
        setEditorState(null);
        setPendingTemplate(null);
    };

    // Atualização manual: revalida o cache das queries que alimentam esta tela
    // (lista de rotinas, ordenação, áreas e contadores de ocorrência) sem recarregar
    // a página. invalidateQueries (refetchType 'active') evita requisições duplicadas.
    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["checklists"] }),
                queryClient.invalidateQueries({ queryKey: ["checklist-orders", restaurantId] }),
                queryClient.invalidateQueries({ queryKey: ["areas-all", restaurantId] }),
                queryClient.invalidateQueries({ queryKey: ["task-issues"] }),
                queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", restaurantId] }),
            ]);
            setDeleteToast({ kind: "success", message: "Lista atualizada." });
        } catch (e) {
            console.error("Erro ao atualizar a lista de rotinas:", e);
            setDeleteToast({ kind: "error", message: "Não foi possível atualizar. Tente novamente." });
        } finally {
            setIsRefreshing(false);
        }
    };

    // Sprint 70 — abrir nova rotina vazia (limpa qualquer modelo pendente).
    const handleNewChecklist = () => {
        setPendingTemplate(null);
        setEditorState({ checklist: null, mode: "new" });
    };

    // Sprint 70 — "Usar Este Modelo": fecha o browser e abre o form pré-preenchido.
    const handleUseTemplate = (template: ChecklistTemplate) => {
        setTemplatesBrowserOpen(false);
        setPendingTemplate(template);
        setEditorState({ checklist: null, mode: "new" });
    };

    // Sprint 72 — dados para o preview dos Kits (dedupe + áreas existentes).
    const existingTemplateIds = useMemo(() => {
        const set = new Set<string>();
        for (const c of checklists) {
            if (c.origin_template_id && c.status !== "archived") set.add(c.origin_template_id);
        }
        return set;
    }, [checklists]);
    const existingAreaNames = useMemo(
        () => new Set(areas.map((a) => a.name.trim().toLowerCase())),
        [areas]
    );

    // Sprint 70 — casa a área sugerida do modelo com uma área existente (por nome).
    const templateInitialAreaId = useMemo(() => {
        if (!pendingTemplate) return selectedAreaId;
        const label = pendingTemplate.suggested_area_label?.trim().toLowerCase();
        const match = label ? areas.find((a) => a.name.trim().toLowerCase() === label) : undefined;
        return match?.id ?? selectedAreaId;
    }, [pendingTemplate, areas, selectedAreaId]);

    const showSidePanel = editorState?.mode === "view";
    const showEditModal = editorState?.mode === "edit" || editorState?.mode === "new";

    // ─── MAIN RENDER ────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-[calc(100vh-72px)] overflow-hidden bg-[#0a1215]">
            {/* Sprint 75 — toast transitório de exclusão (sucesso/erro) */}
            {deleteToast && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-[440px] w-[calc(100%-1.5rem)] rounded-xl shadow-2xl px-4 py-3 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300 ${
                        deleteToast.kind === "success"
                            ? "bg-emerald-500 text-[#04221a]"
                            : "bg-red-500 text-white"
                    }`}
                >
                    <span className="material-symbols-outlined text-[20px] shrink-0">
                        {deleteToast.kind === "success" ? "check_circle" : "error"}
                    </span>
                    <div className="flex-1 text-sm font-semibold leading-tight">{deleteToast.message}</div>
                    <button
                        onClick={() => setDeleteToast(null)}
                        className="opacity-70 hover:opacity-100 text-lg leading-none"
                        aria-label="Fechar"
                    >
                        ×
                    </button>
                </div>
            )}
            <ChecklistHeader
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                view={view}
                onViewChange={setView}
                onNewChecklist={handleNewChecklist}
                onExploreTemplates={() => setTemplatesBrowserOpen(true)}
                canCreate={billing?.access.can_create_resources ?? true}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
            />

            <ChecklistFilters
                selectedShift={selectedShift}
                onShiftChange={setShiftFilter}
                selectedAreaId={selectedAreaId}
                onAreaChange={setAreaFilter}
                areas={areas}
                isLoadingAreas={isLoadingAreas}
                selectedAvailability={selectedAvailability}
                onAvailabilityChange={setAvailabilityFilter}
                selectedExecStatus={selectedExecStatus}
                onExecStatusChange={setExecStatusFilter}
                selectedType={selectedType}
                onTypeChange={setTypeFilter}
                collaborators={equipeData?.equipe ?? []}
                selectedCollaboratorId={selectedCollaboratorId}
                onCollaboratorChange={setCollaboratorFilter}
                selectedAssignmentOrigin={selectedAssignmentOrigin}
                onAssignmentOriginChange={setAssignmentOriginFilter}
                showUnitFilter={isGlobal}
                units={units}
                selectedUnitId={selectedUnitId}
                onUnitChange={setUnitFilter}
            />

            {isGlobal && selectedUnitId && (() => {
                const unit = units.find((u) => u.id === selectedUnitId);
                if (!unit) return null;
                return (
                    <div className="shrink-0 px-4 py-2 border-b border-[#233f48] bg-[#0a1215] flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-[#92bbc9]">Visualizando:</span>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#13b6ec]/10 text-[#13b6ec] border border-[#13b6ec]/30 font-medium">
                            <span className="material-symbols-outlined text-[14px]">storefront</span>
                            {unit.name}
                        </span>
                        <span className="text-[#92bbc9]">
                            {filtered.length} {filtered.length === 1 ? "rotina" : "rotinas"}
                        </span>
                        <button
                            type="button"
                            onClick={() => setUnitFilter("")}
                            className="ml-auto text-[#92bbc9] hover:text-white transition-colors inline-flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                            Limpar
                        </button>
                    </div>
                );
            })()}

            <div className="flex flex-1 overflow-hidden">
                {/* Painel esquerdo: lista/board */}
                <div
                    className={`${
                        showSidePanel ? "hidden md:flex md:flex-col md:min-w-0 md:flex-1" : "flex-1"
                    } overflow-auto p-4`}
                    style={
                        canBulkAction && selectedIds.size > 0
                            ? { paddingBottom: "calc(var(--bulk-action-bar-h, 0px) + 1rem)" }
                            : undefined
                    }
                >
                    {view === "preview" ? (
                        <ChecklistPreviewView
                            checklists={filtered}
                            currentMinutes={currentMinutes}
                            priorityMode={selectedAreaPriorityMode}
                            isGlobal={isGlobal}
                        />
                    ) : view === "list" ? (
                        <ChecklistListView
                            checklists={filtered}
                            isLoading={isLoading}
                            selectedId={editorState?.checklist?.id ?? null}
                            sortField={sortField}
                            sortOrder={sortOrder}
                            onSortChange={handleSortChange}
                            onSelect={handleSelect}
                            onEdit={handleEdit}
                            onStatusToggle={handleStatusToggle}
                            onDuplicate={handleDuplicate}
                            onDelete={handleDelete}
                            onTemporaryTransfer={
                                canTemporaryTransfer ? setTemporaryTransferTarget : undefined
                            }
                            selectedAreaId={selectedAreaId}
                            hasReducingFilters={(selectedAvailability !== "all" && selectedAvailability !== "") || !!selectedExecStatus}
                            onReorder={handleReorder}
                            onAutoReprioritize={handleAutoReprioritize}
                            currentMinutes={currentMinutes}
                            statusCtx={statusCtx}
                            priorityMode={selectedAreaPriorityMode}
                            isGlobal={isGlobal}
                            selectable={canSelect}
                            selectedIds={selectedIds}
                            onSelectionChange={handleSelectionChange}
                            onSelectAll={handleSelectAll}
                            issueCounts={issueCounts}
                        />
                    ) : (
                        <ChecklistBoardView
                            checklists={filtered}
                            isLoading={isLoading}
                            currentMinutes={currentMinutes}
                            statusCtx={statusCtx}
                            onSelect={handleSelect}
                            onStatusToggle={handleStatusToggle}
                            isGlobal={isGlobal}
                            selectable={canSelect}
                            selectedIds={selectedIds}
                            onSelectionChange={handleSelectionChange}
                            issueCounts={issueCounts}
                        />
                    )}
                </div>

                {/* s90 — Deep-link que NÃO chegou ao contexto: estado elegante, nunca uma
                    tela vazia. Antes, os três casos (rotina excluída, sem acesso, tenant
                    negado) davam o mesmo resultado — nada: nenhum painel, nenhuma mensagem.
                    A notificação também NÃO é marcada como lida (o handshake chama `fail`). */}
                {deepLinkFallbackKind && (
                    <div className="flex-1 md:flex-none md:w-[560px] shrink-0 border-l border-[#233f48] h-full overflow-hidden">
                        <DeepLinkFallback
                            kind={deepLinkFallbackKind}
                            onClose={closeDeepLink}
                        />
                    </div>
                )}

                {/* Painel direito: visualização */}
                {!deepLinkFallbackKind && showSidePanel && editorState && (
                    <div className="flex-1 md:flex-none md:w-[560px] shrink-0 border-l border-[#233f48] h-full overflow-hidden">
                        <ChecklistEditorPanel
                            checklist={editorState.checklist}
                            mode="view"
                            onModeChange={(mode) => setEditorState((s) => (s ? { ...s, mode } : null))}
                            onClose={closeDeepLink}
                            onSaved={handleEditorSaved}
                            restaurantId={restaurantId ?? undefined}
                            focusIssueId={focusIssueId}
                            dateKey={deepLinkDateKey}
                            initialTab={deepLinkTab}
                        />
                    </div>
                )}
            </div>

            {/* Modal de edição/criação */}
            {mounted && (
                <Modal isOpen={showEditModal} onClose={closeEditor} maxWidthClass="max-w-[1080px]">
                    <ChecklistForm
                        checklist={editorState?.checklist ?? null}
                        onSaved={handleEditorSaved}
                        onCancel={closeEditor}
                        initialAreaId={editorState?.mode === "new" ? templateInitialAreaId : undefined}
                        initialTemplate={editorState?.mode === "new" ? pendingTemplate : null}
                    />
                </Modal>
            )}

            {/* Sprint 70 — Explorar Modelos Prontos */}
            {mounted && (
                <TemplatesBrowserModal
                    isOpen={templatesBrowserOpen}
                    onClose={() => setTemplatesBrowserOpen(false)}
                    onUseTemplate={handleUseTemplate}
                    existingTemplateIds={existingTemplateIds}
                    existingAreaNames={existingAreaNames}
                />
            )}

            {/* Ações em massa: exportar PDF (qualquer visão) + copiar (só global) */}
            {canSelect && selectedIds.size > 0 && (
                <BulkActionBar
                    selectedCount={selectedIds.size}
                    onExportPdf={handleExportPdf}
                    isExporting={isExporting}
                    canCopy={canBulkAction}
                    onCopyToUnit={() => setCopyModalOpen(true)}
                    canTransfer={canTransfer}
                    onTransfer={() => setTransferModalOpen(true)}
                    transferDisabled={!!transferDisabledReason}
                    transferDisabledReason={transferDisabledReason}
                    onClearSelection={() => setSelectedIds(new Set())}
                />
            )}

            {mounted && canBulkAction && (
                <CopyChecklistModal
                    isOpen={copyModalOpen}
                    onClose={handleCopyModalClose}
                    selectedChecklists={selectedChecklists}
                    accountId={accountId}
                    sourceRestaurantIds={sourceRestaurantIds}
                />
            )}

            {mounted && transferModalOpen && restaurantId && (
                <TransferResponsibleModal
                    isOpen={transferModalOpen}
                    onClose={() => {
                        setTransferModalOpen(false);
                        setSelectedIds(new Set());
                    }}
                    selectedChecklists={selectedChecklists}
                    restaurantId={restaurantId}
                    collaborators={equipeData?.equipe ?? []}
                    onSuccess={(count) => {
                        setDeleteToast({
                            kind: "success",
                            message: count === 1
                                ? "1 rotina transferida com sucesso."
                                : `${count} rotinas transferidas com sucesso.`,
                        });
                    }}
                />
            )}

            {/* s94 — transferência temporária (uma rotina, pelo menu de 3 pontinhos).
                `today` vem do fuso do RESTAURANTE (useRestaurantNow), nunca do browser:
                é o mesmo dateKey que o backend usa para validar e ativar a janela. */}
            {mounted && temporaryTransferTarget && restaurantId && (
                <TemporaryTransferModal
                    isOpen
                    onClose={() => setTemporaryTransferTarget(null)}
                    checklist={temporaryTransferTarget}
                    restaurantId={restaurantId}
                    collaborators={equipeData?.equipe ?? []}
                    today={tzDateKey}
                    onSuccess={(message) => setDeleteToast({ kind: "success", message })}
                />
            )}
        </div>
    );
}

export default function ChecklistsPage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-[#92bbc9]">Carregando interface...</div>}>
            <ChecklistsContent />
        </Suspense>
    );
}
