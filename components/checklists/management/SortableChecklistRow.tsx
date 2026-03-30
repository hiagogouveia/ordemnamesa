"use client";

import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";

const SHIFT_LABELS: Record<string, string> = {
    morning: "Manhã",
    afternoon: "Tarde",
    evening: "Noite",
    any: "Todos",
};

const RECURRENCE_LABELS: Record<string, string> = {
    none: "—",
    daily: "Diária",
    weekly: "Semanal",
    monthly: "Mensal",
    yearly: "Anual",
    weekdays: "Dias úteis",
    custom: "Personalizada",
};

interface SortableChecklistRowProps {
    checklist: ExtendedChecklist;
    isSelected: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onStatusToggle: (active: boolean) => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

export function SortableChecklistRow({
    checklist,
    isSelected,
    onSelect,
    onEdit,
    onStatusToggle,
    onDuplicate,
    onDelete,
}: SortableChecklistRowProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: checklist.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 1 : undefined,
    };

    useEffect(() => {
        if (!menuOpen) return;
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen]);

    const handleDelete = () => {
        setMenuOpen(false);
        if (window.confirm(`Excluir a lista "${checklist.name}"? Esta ação não pode ser desfeita.`)) {
            onDelete();
        }
    };

    return (
        <tr
            ref={setNodeRef}
            style={style}
            className={`border-b border-[#1a2c32] transition-colors ${
                isSelected ? "bg-[#13b6ec]/5" : "hover:bg-[#16262c]"
            }`}
        >
            {/* Drag handle */}
            <td className="pl-4 pr-2 py-3 w-8">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-[#325a67] hover:text-[#92bbc9] transition-colors touch-none flex items-center justify-center"
                    aria-label="Arrastar para reordenar"
                >
                    <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
                </button>
            </td>

            {/* Título */}
            <td className="px-3 py-3">
                <span className="font-semibold text-white text-sm">{checklist.name}</span>
                {checklist.description && (
                    <p className="text-[#92bbc9] text-xs mt-0.5 line-clamp-1">{checklist.description}</p>
                )}
            </td>

            {/* Turno */}
            <td className="px-3 py-3">
                <span className="text-[#92bbc9] text-sm">{SHIFT_LABELS[checklist.shift] ?? checklist.shift}</span>
            </td>

            {/* Área */}
            <td className="px-3 py-3">
                {checklist.area ? (
                    <span className="flex items-center gap-1.5">
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: checklist.area.color || "#325a67" }}
                        />
                        <span className="text-[#92bbc9] text-sm">{checklist.area.name}</span>
                    </span>
                ) : checklist.roles?.name ? (
                    <span className="flex items-center gap-1.5">
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: checklist.roles.color || "#325a67" }}
                        />
                        <span className="text-[#92bbc9] text-sm">{checklist.roles.name}</span>
                    </span>
                ) : (
                    <span className="text-[#325a67] text-sm italic">Qualquer área</span>
                )}
            </td>

            {/* Responsável */}
            <td className="px-3 py-3 hidden md:table-cell">
                <span className={`text-sm ${checklist.responsible?.name ? "text-[#92bbc9]" : "text-[#325a67] italic"}`}>
                    {checklist.responsible?.name ?? "Distribuído para toda a área"}
                </span>
            </td>

            {/* Recorrência */}
            <td className="px-3 py-3 hidden lg:table-cell">
                <span className="text-[#92bbc9] text-sm">
                    {RECURRENCE_LABELS[checklist.recurrence ?? "none"] ?? "—"}
                </span>
            </td>

            {/* Status */}
            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={() => onStatusToggle(!checklist.active)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                        checklist.active
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
                            : "bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30"
                    }`}
                    title={checklist.active ? "Clique para desativar" : "Clique para ativar"}
                >
                    <span className="material-symbols-outlined text-[12px]">
                        {checklist.active ? "check_circle" : "cancel"}
                    </span>
                    {checklist.active ? "Ativo" : "Inativo"}
                </button>
            </td>

            {/* Ações */}
            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <div ref={menuRef} className="relative">
                    <button
                        onClick={() => setMenuOpen((v) => !v)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#233f48] text-[#92bbc9] hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-[20px]">more_vert</span>
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-[#16262c] border border-[#233f48] rounded-xl shadow-xl min-w-[160px] py-1 overflow-hidden">
                            <button
                                onClick={() => { setMenuOpen(false); onSelect(); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#92bbc9] hover:bg-[#233f48] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                                Visualizar
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); onEdit(); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#92bbc9] hover:bg-[#233f48] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                Editar
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); onDuplicate(); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#92bbc9] hover:bg-[#233f48] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">content_copy</span>
                                Duplicar
                            </button>
                            <div className="border-t border-[#233f48] my-1" />
                            <button
                                onClick={handleDelete}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                Excluir
                            </button>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}
