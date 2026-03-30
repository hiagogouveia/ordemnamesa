"use client";

import { useState, useRef, useCallback } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChecklistRow } from "./ChecklistRow";
import { SortableChecklistRow } from "./SortableChecklistRow";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

type SortField = "name" | "shift" | "area" | "responsible" | "status";
type SortOrder = "asc" | "desc";

interface SortableHeaderProps {
    field: SortField;
    label: string;
    currentField: SortField | null;
    currentOrder: SortOrder;
    onSort: (field: SortField) => void;
    className?: string;
    disabled?: boolean;
}

function SortableHeader({ field, label, currentField, currentOrder, onSort, className = "", disabled = false }: SortableHeaderProps) {
    const isActive = currentField === field;

    if (disabled) {
        return (
            <th className={`px-3 py-2 text-left ${className}`}>
                <span className="text-xs font-bold uppercase tracking-wide text-[#233f48]">{label}</span>
            </th>
        );
    }

    return (
        <th
            className={`px-3 py-2 text-left cursor-pointer select-none group ${className}`}
            onClick={() => onSort(field)}
        >
            <span className="flex items-center gap-1">
                <span
                    className={`text-xs font-bold uppercase tracking-wide transition-colors ${
                        isActive ? "text-[#13b6ec]" : "text-[#92bbc9] group-hover:text-white"
                    }`}
                >
                    {label}
                </span>
                <span
                    className={`material-symbols-outlined text-[14px] transition-all ${
                        isActive ? "text-[#13b6ec]" : "text-[#325a67] opacity-0 group-hover:opacity-100"
                    }`}
                >
                    {isActive && currentOrder === "desc" ? "arrow_downward" : "arrow_upward"}
                </span>
            </span>
        </th>
    );
}

interface ChecklistListViewProps {
    checklists: ExtendedChecklist[];
    isLoading: boolean;
    selectedId: string | null;
    sortField: SortField | null;
    sortOrder: SortOrder;
    onSortChange: (field: SortField) => void;
    onSelect: (checklist: ExtendedChecklist) => void;
    onEdit: (checklist: ExtendedChecklist) => void;
    onStatusToggle: (id: string, active: boolean) => void;
    onDuplicate: (checklist: ExtendedChecklist) => void;
    onDelete: (id: string) => void;
    onReorder: (items: Array<{ id: string; order_index: number }>) => Promise<void>;
    selectedAreaId: string;
}

export function ChecklistListView({
    checklists,
    isLoading,
    selectedId,
    sortField,
    sortOrder,
    onSortChange,
    onSelect,
    onEdit,
    onStatusToggle,
    onDuplicate,
    onDelete,
    onReorder,
    selectedAreaId,
}: ChecklistListViewProps) {
    const [reorderMode, setReorderMode] = useState(false);
    const [localItems, setLocalItems] = useState<ExtendedChecklist[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const beforeReorderRef = useRef<ExtendedChecklist[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleEnterReorder = () => {
        const sorted = [...checklists].sort(
            (a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999)
        );
        beforeReorderRef.current = sorted;
        setLocalItems(sorted);
        setReorderMode(true);
    };

    const handleCancelReorder = () => {
        setLocalItems(beforeReorderRef.current);
        setReorderMode(false);
    };

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setLocalItems((prev) => {
            const activeIdx = prev.findIndex((c) => c.id === String(active.id));
            const overIdx = prev.findIndex((c) => c.id === String(over.id));
            if (activeIdx === -1 || overIdx === -1) return prev;
            return arrayMove(prev, activeIdx, overIdx);
        });
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = localItems.map((item, index) => ({ id: item.id, order_index: index }));
            await onReorder(payload);
            setReorderMode(false);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div
                        key={i}
                        className="animate-pulse bg-[#16262c] border border-[#233f48] rounded-xl h-14 w-full"
                    />
                ))}
            </div>
        );
    }

    if (checklists.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <span className="material-symbols-outlined text-[#325a67] text-5xl">search_off</span>
                <p className="text-white font-semibold">Nenhuma lista encontrada</p>
                <p className="text-[#92bbc9] text-sm max-w-xs">
                    Tente ajustar os filtros ou criar uma nova lista.
                </p>
            </div>
        );
    }

    const displayItems = reorderMode ? localItems : checklists;

    return (
        <div className="overflow-x-auto">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-1 pb-2">
                <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#325a67] text-[14px]">info</span>
                    <span className="text-[#325a67] text-xs">
                        {reorderMode
                            ? "Arraste as linhas para reordenar. A ordem é salva por turno."
                            : "Ative o modo de reordenação para ajustar a ordem das rotinas."}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {reorderMode ? (
                        <>
                            <button
                                onClick={handleCancelReorder}
                                disabled={isSaving}
                                className="px-3 py-1.5 text-xs font-bold text-[#92bbc9] hover:text-white bg-[#16262c] border border-[#233f48] rounded-lg transition-colors disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] rounded-lg transition-colors disabled:opacity-60"
                            >
                                {isSaving ? (
                                    <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[14px]">save</span>
                                )}
                                Salvar ordem
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleEnterReorder}
                            disabled={!selectedAreaId}
                            title={!selectedAreaId ? "Selecione uma área para reordenar" : undefined}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#16262c] border border-[#233f48] rounded-lg transition-colors ${
                                selectedAreaId
                                    ? "text-[#92bbc9] hover:text-white"
                                    : "text-[#325a67] cursor-not-allowed opacity-50"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[14px]">swap_vert</span>
                            Reordenar
                        </button>
                    )}
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <table className="w-full min-w-[640px]">
                    <thead>
                        <tr className="border-b border-[#233f48]">
                            <th className="pl-4 pr-2 py-2 w-8" />
                            <SortableHeader
                                field="name"
                                label="Título"
                                currentField={sortField}
                                currentOrder={sortOrder}
                                onSort={onSortChange}
                                disabled={reorderMode}
                            />
                            <SortableHeader
                                field="shift"
                                label="Turno"
                                currentField={sortField}
                                currentOrder={sortOrder}
                                onSort={onSortChange}
                                disabled={reorderMode}
                            />
                            <SortableHeader
                                field="area"
                                label="Área"
                                currentField={sortField}
                                currentOrder={sortOrder}
                                onSort={onSortChange}
                                disabled={reorderMode}
                            />
                            <SortableHeader
                                field="responsible"
                                label="Responsável"
                                currentField={sortField}
                                currentOrder={sortOrder}
                                onSort={onSortChange}
                                disabled={reorderMode}
                                className="hidden md:table-cell"
                            />
                            <th className="px-3 py-2 text-left text-[#92bbc9] text-xs font-bold uppercase tracking-wide hidden lg:table-cell">
                                Recorrência
                            </th>
                            <SortableHeader
                                field="status"
                                label="Status"
                                currentField={sortField}
                                currentOrder={sortOrder}
                                onSort={onSortChange}
                                disabled={reorderMode}
                            />
                            <th className="px-3 py-2 w-12" />
                        </tr>
                    </thead>
                    <tbody>
                        {reorderMode ? (
                            <SortableContext
                                items={localItems.map((c) => c.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {localItems.map((checklist) => (
                                    <SortableChecklistRow
                                        key={checklist.id}
                                        checklist={checklist}
                                        isSelected={checklist.id === selectedId}
                                        onSelect={() => onSelect(checklist)}
                                        onEdit={() => onEdit(checklist)}
                                        onStatusToggle={(active) => onStatusToggle(checklist.id, active)}
                                        onDuplicate={() => onDuplicate(checklist)}
                                        onDelete={() => onDelete(checklist.id)}
                                    />
                                ))}
                            </SortableContext>
                        ) : (
                            displayItems.map((checklist) => (
                                <ChecklistRow
                                    key={checklist.id}
                                    checklist={checklist}
                                    isSelected={checklist.id === selectedId}
                                    onSelect={() => onSelect(checklist)}
                                    onEdit={() => onEdit(checklist)}
                                    onStatusToggle={(active) => onStatusToggle(checklist.id, active)}
                                    onDuplicate={() => onDuplicate(checklist)}
                                    onDelete={() => onDelete(checklist.id)}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </DndContext>
        </div>
    );
}
