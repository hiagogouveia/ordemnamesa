"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useChecklists, useCreateChecklist, useDeleteChecklist, useToggleChecklistStatus } from "@/lib/hooks/use-checklists";
import { useChecklistOrders, useUpdateChecklistOrders } from "@/lib/hooks/use-checklist-orders";
import { useAllAreas } from "@/lib/hooks/use-areas";
import { ChecklistHeader } from "@/components/checklists/management/ChecklistHeader";
import { ChecklistFilters } from "@/components/checklists/management/ChecklistFilters";
import { ChecklistListView } from "@/components/checklists/management/ChecklistListView";
import { ChecklistBoardView } from "@/components/checklists/management/ChecklistBoardView";
import { ChecklistEditorPanel } from "@/components/checklists/management/ChecklistEditorPanel";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import type { ChecklistOrder } from "@/lib/types";

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
    const [view, setView] = useState<"list" | "board">("list");
    const [searchQuery, setSearchQuery] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [editorState, setEditorState] = useState<EditorState>(null);

    // URL-persisted filters + sorting
    const selectedShift = searchParams.get("shift") ?? "";
    const selectedAreaId = searchParams.get("area_id") ?? "";
    const sortField = (searchParams.get("sort") as SortField | null) ?? null;
    const sortOrder = (searchParams.get("order") as SortOrder | null) ?? "asc";

    // Store
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const userRole = useRestaurantStore((state) => state.userRole);

    // Queries
    const { data: checklists = [], isLoading } = useChecklists(restaurantId ?? undefined);
    const { data: orders = [] } = useChecklistOrders(restaurantId ?? undefined);
    const { data: areas = [] } = useAllAreas(restaurantId ?? undefined);

    // Mutations
    const { mutate: toggleStatus } = useToggleChecklistStatus();
    const { mutate: deleteChecklist } = useDeleteChecklist();
    const { mutate: createChecklist } = useCreateChecklist();
    const { mutateAsync: updateOrders } = useUpdateChecklistOrders();

    // Derived: filtered + sorted list (MUST be before any conditional return)
    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const result = (checklists as ExtendedChecklist[]).filter((c) => {
            if (q && !c.name.toLowerCase().includes(q)) return false;
            if (selectedShift && c.shift !== selectedShift && c.shift !== "any") return false;
            if (selectedAreaId && c.area_id !== selectedAreaId) return false;
            return true;
        });

        if (!sortField) return result;

        return [...result].sort((a, b) => {
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
                    valA = (a.area?.name ?? a.roles?.name)?.toLowerCase() ?? "\uffff";
                    valB = (b.area?.name ?? b.roles?.name)?.toLowerCase() ?? "\uffff";
                    break;
                case "responsible":
                    valA = a.responsible?.name?.toLowerCase() ?? "\uffff";
                    valB = b.responsible?.name?.toLowerCase() ?? "\uffff";
                    break;
                case "status":
                    valA = a.active ? 0 : 1;
                    valB = b.active ? 0 : 1;
                    break;
                default:
                    return 0;
            }

            const mult = sortOrder === "asc" ? 1 : -1;
            if (valA < valB) return -1 * mult;
            if (valA > valB) return 1 * mult;
            return 0;
        });
    }, [checklists, searchQuery, selectedShift, selectedAreaId, sortField, sortOrder]);

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

    const handleEditorSaved = () => {
        setEditorState(null);
    };

    // ─── MAIN RENDER ────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-[calc(100vh-72px)] overflow-hidden bg-[#0a1215]">
            <ChecklistHeader
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                showFilters={showFilters}
                onToggleFilters={() => setShowFilters((v) => !v)}
                view={view}
                onViewChange={setView}
                onNewChecklist={() => setEditorState({ checklist: null, mode: "new" })}
            />

            <ChecklistFilters
                visible={showFilters}
                selectedShift={selectedShift}
                onShiftChange={setShiftFilter}
                selectedAreaId={selectedAreaId}
                onAreaChange={setAreaFilter}
                areas={areas}
            />

            <div className="flex flex-1 overflow-hidden">
                {/* Painel esquerdo: lista/board */}
                <div
                    className={`${
                        editorState ? "hidden md:flex md:flex-col md:min-w-0 md:flex-1" : "flex-1"
                    } overflow-auto p-4`}
                >
                    {view === "list" ? (
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
                        />
                    ) : (
                        <ChecklistBoardView
                            checklists={filtered}
                            orders={orders}
                            isLoading={isLoading}
                            onSelect={handleSelect}
                            onStatusToggle={handleStatusToggle}
                            onOrdersSave={handleOrdersSave}
                        />
                    )}
                </div>

                {/* Painel direito: editor */}
                {editorState && (
                    <div className="flex-1 md:flex-none md:w-[560px] shrink-0 border-l border-[#233f48] h-full overflow-hidden">
                        <ChecklistEditorPanel
                            checklist={editorState.checklist}
                            mode={editorState.mode}
                            onModeChange={(mode) => setEditorState((s) => (s ? { ...s, mode } : null))}
                            onClose={() => setEditorState(null)}
                            onSaved={handleEditorSaved}
                        />
                    </div>
                )}
            </div>
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
