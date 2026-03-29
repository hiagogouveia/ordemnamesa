"use client";

import { ChecklistRow } from "./ChecklistRow";
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
}

function SortableHeader({ field, label, currentField, currentOrder, onSort, className = "" }: SortableHeaderProps) {
    const isActive = currentField === field;
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
}: ChecklistListViewProps) {
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

    return (
        <div className="overflow-x-auto">
            <div className="flex items-center gap-1.5 px-1 pb-2">
                <span className="material-symbols-outlined text-[#325a67] text-[14px]">info</span>
                <span className="text-[#325a67] text-xs">A ordem das rotinas é definida no modo Cards</span>
            </div>
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
                        />
                        <SortableHeader
                            field="shift"
                            label="Turno"
                            currentField={sortField}
                            currentOrder={sortOrder}
                            onSort={onSortChange}
                        />
                        <SortableHeader
                            field="area"
                            label="Área"
                            currentField={sortField}
                            currentOrder={sortOrder}
                            onSort={onSortChange}
                        />
                        <SortableHeader
                            field="responsible"
                            label="Responsável"
                            currentField={sortField}
                            currentOrder={sortOrder}
                            onSort={onSortChange}
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
                        />
                        <th className="px-3 py-2 w-12" />
                    </tr>
                </thead>
                <tbody>
                    {checklists.map((checklist) => (
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
                    ))}
                </tbody>
            </table>
        </div>
    );
}
