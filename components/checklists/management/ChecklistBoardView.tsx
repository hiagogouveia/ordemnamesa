"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ChecklistBoardColumn } from "./ChecklistBoardColumn";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import type { ChecklistOrder } from "@/lib/types";

const COLUMNS: { shift: "morning" | "afternoon" | "evening"; label: string }[] = [
    { shift: "morning", label: "Manhã" },
    { shift: "afternoon", label: "Tarde" },
    { shift: "evening", label: "Noite" },
];

function buildColumn(
    shift: "morning" | "afternoon" | "evening",
    checklists: ExtendedChecklist[],
    orders: ChecklistOrder[]
): (ExtendedChecklist & { position: number })[] {
    return checklists
        .filter((c) => c.shift === shift)
        .map((c) => {
            const order = orders.find(
                (o) => o.checklist_id === c.id && o.shift === shift
            );
            return { ...c, position: order?.position ?? 9999 };
        })
        .sort((a, b) => a.position - b.position);
}

interface ChecklistBoardViewProps {
    checklists: ExtendedChecklist[];
    orders: ChecklistOrder[];
    isLoading: boolean;
    onSelect: (checklist: ExtendedChecklist) => void;
    onStatusToggle: (id: string, active: boolean) => void;
    onOrdersSave: (orders: ChecklistOrder[]) => Promise<void>;
}

export function ChecklistBoardView({
    checklists,
    orders,
    isLoading,
    onSelect,
    onStatusToggle,
    onOrdersSave,
}: ChecklistBoardViewProps) {
    const [editMode, setEditMode] = useState(false);
    const [localOrders, setLocalOrders] = useState<ChecklistOrder[]>(orders);
    const [isSaving, setIsSaving] = useState(false);
    const beforeEditOrdersRef = useRef<ChecklistOrder[]>([]);

    // Sync local orders when server data changes (and not in edit mode)
    useEffect(() => {
        if (!editMode) {
            setLocalOrders(orders);
        }
    }, [orders, editMode]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleEditModeToggle = () => {
        if (!editMode) {
            beforeEditOrdersRef.current = [...localOrders];
        }
        setEditMode((v) => !v);
    };

    const handleCancelEdit = () => {
        setLocalOrders(beforeEditOrdersRef.current);
        setEditMode(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onOrdersSave(localOrders);
            setEditMode(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const activeShift = (active.data.current as { shift?: string })?.shift;
            const overShift = (over.data.current as { shift?: string })?.shift;

            // Enforce same-column-only drops
            if (!activeShift || activeShift !== overShift) return;

            const shift = activeShift as "morning" | "afternoon" | "evening";
            const activeChecklistId = (active.data.current as { checklist_id?: string })?.checklist_id;
            const overChecklistId = (over.data.current as { checklist_id?: string })?.checklist_id;

            if (!activeChecklistId || !overChecklistId) return;

            setLocalOrders((prev) => {
                // Get all checklists for this column (same logic as buildColumn)
                const colChecklists = checklists.filter(
                    (c) => c.shift === shift
                );

                // Build current order for this column
                const colOrders = colChecklists
                    .map((c) => {
                        const existing = prev.find(
                            (o) => o.checklist_id === c.id && o.shift === shift
                        );
                        return {
                            checklist_id: c.id,
                            position: existing?.position ?? 9999,
                        };
                    })
                    .sort((a, b) => a.position - b.position);

                const activeIdx = colOrders.findIndex(
                    (o) => o.checklist_id === activeChecklistId
                );
                const overIdx = colOrders.findIndex(
                    (o) => o.checklist_id === overChecklistId
                );

                if (activeIdx === -1 || overIdx === -1) return prev;

                const reordered = arrayMove(colOrders, activeIdx, overIdx).map(
                    (item, i) => ({ ...item, position: i })
                );

                // Merge back
                const otherOrders = prev.filter((o) => o.shift !== shift);
                const newColOrders: ChecklistOrder[] = reordered.map((item) => {
                    const existing = prev.find(
                        (o) => o.checklist_id === item.checklist_id && o.shift === shift
                    );
                    return {
                        id: existing?.id ?? `temp-${item.checklist_id}-${shift}`,
                        restaurant_id: existing?.restaurant_id ?? "",
                        checklist_id: item.checklist_id,
                        shift,
                        position: item.position,
                    };
                });

                return [...otherOrders, ...newColOrders];
            });
        },
        [checklists]
    );

    const boardData = useMemo(
        () =>
            COLUMNS.reduce(
                (acc, col) => {
                    acc[col.shift] = buildColumn(col.shift, checklists, localOrders);
                    return acc;
                },
                {} as Record<string, (ExtendedChecklist & { position: number })[]>
            ),
        [checklists, localOrders]
    );

    if (isLoading) {
        return (
            <div className="flex gap-4 h-full">
                {COLUMNS.map((col) => (
                    <div
                        key={col.shift}
                        className="min-w-[280px] flex-1 bg-[#16262c] border border-[#233f48] rounded-xl p-3 flex flex-col gap-2"
                    >
                        <div className="animate-pulse bg-[#233f48] h-8 rounded-lg mb-1" />
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="animate-pulse bg-[#0a1215] border border-[#233f48] rounded-xl h-20"
                            />
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Board toolbar */}
            <div className="flex items-center justify-between shrink-0">
                <p className="text-[#92bbc9] text-xs">
                    {editMode
                        ? "Arraste os cards para reordenar dentro de cada turno."
                        : "Ative o modo edição para reordenar as listas por turno."}
                </p>
                <div className="flex items-center gap-2">
                    {editMode ? (
                        <>
                            <button
                                onClick={handleCancelEdit}
                                disabled={isSaving}
                                className="px-3 py-1.5 text-xs font-bold text-[#92bbc9] hover:text-white bg-[#16262c] border border-[#233f48] rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] rounded-lg transition-colors disabled:opacity-60"
                            >
                                {isSaving ? (
                                    <span className="material-symbols-outlined text-[14px] animate-spin">
                                        refresh
                                    </span>
                                ) : (
                                    <span className="material-symbols-outlined text-[14px]">save</span>
                                )}
                                Salvar alterações
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleEditModeToggle}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#92bbc9] hover:text-white bg-[#16262c] border border-[#233f48] rounded-lg transition-colors"
                        >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            Modo edição
                        </button>
                    )}
                </div>
            </div>

            {/* Board columns */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="flex gap-4 flex-1 overflow-x-auto pb-2">
                    {COLUMNS.map((col) => (
                        <ChecklistBoardColumn
                            key={col.shift}
                            shift={col.shift}
                            shiftLabel={col.label}
                            cards={boardData[col.shift] ?? []}
                            editMode={editMode}
                            onSelect={onSelect}
                            onStatusToggle={onStatusToggle}
                        />
                    ))}
                </div>
            </DndContext>
        </div>
    );
}
