"use client";

import { useState, useMemo, Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useChecklists, useCreateChecklist, useDeleteChecklist, useToggleChecklistStatus } from "@/lib/hooks/use-checklists";
import { useChecklistOrders, useUpdateChecklistOrders } from "@/lib/hooks/use-checklist-orders";
import { createClient } from "@/lib/supabase/client";
import { useAllAreas } from "@/lib/hooks/use-areas";
import { useEquipe } from "@/lib/hooks/use-equipe";
import { ChecklistHeader } from "@/components/checklists/management/ChecklistHeader";
import { ChecklistFilters } from "@/components/checklists/management/ChecklistFilters";
import { ChecklistListView } from "@/components/checklists/management/ChecklistListView";
import { ChecklistBoardView } from "@/components/checklists/management/ChecklistBoardView";
import { ChecklistEditorPanel } from "@/components/checklists/management/ChecklistEditorPanel";
import { ChecklistPreviewView } from "@/components/checklists/management/ChecklistPreviewView";
import { ChecklistForm } from "@/components/checklists/checklist-form";
import { Modal } from "@/components/ui/modal";
import { filterChecklistsByCollaborator } from "@/lib/utils/filter-checklists-by-collaborator";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import { getOperationalStatus } from "@/lib/utils/get-operational-status";
import type { ChecklistOrder, ExecutionStatus, PriorityMode } from "@/lib/types";

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

    // UI state
    const [mounted, setMounted] = useState(false);
    const [view, setView] = useState<"list" | "board" | "preview">("list");
    const [currentMinutes, setCurrentMinutes] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [editorState, setEditorState] = useState<EditorState>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const compute = () => {
            const now = new Date();
            return now.getHours() * 60 + now.getMinutes();
        };
        setCurrentMinutes(compute());
        const id = setInterval(() => setCurrentMinutes(compute()), 60_000);
        return () => clearInterval(id);
    }, []);

    const selectedShift = searchParams.get("shift") ?? "";
    const selectedAreaId = searchParams.get("area_id") ?? "";
    const selectedAvailability = searchParams.get("availability") ?? "active";
    const selectedExecStatus = searchParams.get("exec_status") ?? "";
    const selectedCollaboratorId = searchParams.get("collaborator_id") ?? "";
    const sortField = (searchParams.get("sort") as SortField | null) ?? null;
    const sortOrder = (searchParams.get("order") as SortOrder | null) ?? "asc";

    const queryClient = useQueryClient();

    // Store
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const userRole = useRestaurantStore((state) => state.userRole);

    // Queries
    const { data: checklists = [], isLoading } = useChecklists(restaurantId ?? undefined);
    const { data: orders = [] } = useChecklistOrders(restaurantId ?? undefined);
    const { data: areas = [], isLoading: isLoadingAreas } = useAllAreas(restaurantId ?? undefined);
    const { data: equipeData } = useEquipe(restaurantId ?? null);

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
                equipeData?.equipe ?? []
            ) as ExtendedChecklist[]
            : checklists as ExtendedChecklist[];

        const result = collaboratorFiltered.filter((c) => {
            if (q && !c.name.toLowerCase().includes(q)) return false;
            if (selectedShift && c.shift !== selectedShift && c.shift !== "any") return false;
            if (selectedAreaId && c.area_id !== selectedAreaId) return false;
            if (selectedAvailability === "active" && (!c.active || c.status === "draft")) return false;
            if (selectedAvailability === "inactive" && (c.active || c.status === "draft")) return false;
            if (selectedAvailability === "draft" && c.status !== "draft") return false;

            // Filtro por status de execução
            if (selectedExecStatus) {
                const computed = getOperationalStatus(c, currentMinutes);
                if (computed !== selectedExecStatus) return false;
            }

            return true;
        });

        // Separar rascunhos das outras rotinas
        const drafts = result.filter(c => c.status === "draft");
        const nonDrafts = result.filter(c => c.status !== "draft");

        // Sempre ordenar por order_index como base
        const sortedNonDrafts = [...nonDrafts].sort((a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999));
        const sortedDrafts = [...drafts].sort((a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999));

        if (!sortField) {
            // Se não houver sort explícito, garantir drafts por último
            return [...sortedNonDrafts, ...sortedDrafts];
        }

        const sortedResult = [...nonDrafts, ...drafts].sort((a, b) => {
            // Sempre enviar drafts pro final a não ser que tenhamos escolhido um field diferente e seja uma exigência estrita (?)
            // Mas a regra diz: quando o filtro "Todas" estiver ativo, Rascunhos sempre por último.
            // Implementando: se a estiver draft e b não, envia a para o fim.
            if (a.status === "draft" && b.status !== "draft") return 1;
            if (a.status !== "draft" && b.status === "draft") return -1;

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
                    valA = (a.area?.name || "\uffff").toLowerCase();
                    valB = (b.area?.name || "\uffff").toLowerCase();
                    break;
                case "responsible":
                    valA = a.responsible?.name?.toLowerCase() ?? "\uffff";
                    valB = b.responsible?.name?.toLowerCase() ?? "\uffff";
                    break;
                case "status":
                    valA = a.status === "draft" ? 2 : (!a.active ? 1 : 0);
                    valB = b.status === "draft" ? 2 : (!b.active ? 1 : 0);
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
    }, [checklists, searchQuery, selectedShift, selectedAreaId, selectedAvailability, selectedExecStatus, selectedCollaboratorId, equipeData, currentMinutes, sortField, sortOrder]);

    // ─── URL HELPERS ────────────────────────────────────────────────────────────

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

    const setCollaboratorFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set("collaborator_id", value);
        else params.delete("collaborator_id");
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
        deleteChecklist({ id, restaurantId });
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
    };

    const showSidePanel = editorState?.mode === "view";
    const showEditModal = editorState?.mode === "edit" || editorState?.mode === "new";

    // ─── MAIN RENDER ────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-[calc(100vh-72px)] overflow-hidden bg-[#0a1215]">
            <ChecklistHeader
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                view={view}
                onViewChange={setView}
                onNewChecklist={() => setEditorState({ checklist: null, mode: "new" })}
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
                collaborators={equipeData?.equipe ?? []}
                selectedCollaboratorId={selectedCollaboratorId}
                onCollaboratorChange={setCollaboratorFilter}
            />

            <div className="flex flex-1 overflow-hidden">
                {/* Painel esquerdo: lista/board */}
                <div
                    className={`${
                        showSidePanel ? "hidden md:flex md:flex-col md:min-w-0 md:flex-1" : "flex-1"
                    } overflow-auto p-4`}
                >
                    {view === "preview" ? (
                        <ChecklistPreviewView
                            checklists={filtered}
                            currentMinutes={currentMinutes}
                            priorityMode={selectedAreaPriorityMode}
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
                            selectedAreaId={selectedAreaId}
                            hasReducingFilters={!!(selectedShift || (selectedAvailability !== "all" && selectedAvailability !== "") || selectedExecStatus)}
                            onReorder={handleReorder}
                            onAutoReprioritize={handleAutoReprioritize}
                            currentMinutes={currentMinutes}
                            priorityMode={selectedAreaPriorityMode}
                        />
                    ) : (
                        <ChecklistBoardView
                            checklists={filtered}
                            isLoading={isLoading}
                            currentMinutes={currentMinutes}
                            onSelect={handleSelect}
                            onStatusToggle={handleStatusToggle}
                        />
                    )}
                </div>

                {/* Painel direito: visualização */}
                {showSidePanel && editorState && (
                    <div className="flex-1 md:flex-none md:w-[560px] shrink-0 border-l border-[#233f48] h-full overflow-hidden">
                        <ChecklistEditorPanel
                            checklist={editorState.checklist}
                            mode="view"
                            onModeChange={(mode) => setEditorState((s) => (s ? { ...s, mode } : null))}
                            onClose={() => setEditorState(null)}
                            onSaved={handleEditorSaved}
                        />
                    </div>
                )}
            </div>

            {/* Modal de edição/criação */}
            {mounted && (
                <Modal isOpen={showEditModal} onClose={() => setEditorState(null)}>
                    <ChecklistForm
                        checklist={editorState?.checklist ?? null}
                        onSaved={handleEditorSaved}
                        onCancel={() => setEditorState(null)}
                        initialAreaId={editorState?.mode === "new" ? selectedAreaId : undefined}
                    />
                </Modal>
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
