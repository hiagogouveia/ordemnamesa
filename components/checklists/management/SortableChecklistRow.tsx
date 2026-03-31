"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import type { ExecutionStatus } from "@/lib/types";

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

const EXECUTION_STATUS_CONFIG: Record<ExecutionStatus, { label: string; className: string }> = {
    pending: {
        label: "Pendente",
        className: "bg-[#16262c] text-[#92bbc9] border-[#233f48]",
    },
    in_progress: {
        label: "Em execução",
        className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    },
    done: {
        label: "Concluído",
        className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    },
    overdue: {
        label: "Atrasado",
        className: "bg-red-500/20 text-red-400 border-red-500/30",
    },
    blocked: {
        label: "Impedido",
        className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    },
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
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

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
        opacity: isDragging ? 0.5 : checklist.active ? 1 : 0.5,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 1 : undefined,
    };

    useEffect(() => {
        if (!menuOpen) return;
        function handleClick(e: MouseEvent) {
            const target = e.target as Node;
            if (!buttonRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
                setMenuOpen(false);
                setMenuPos(null);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen]);

    const handleMenuToggle = () => {
        if (menuOpen) {
            setMenuOpen(false);
            setMenuPos(null);
            return;
        }
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const MENU_HEIGHT = 180;
        const openUp = rect.bottom + MENU_HEIGHT > window.innerHeight;
        setMenuPos({
            top: openUp ? rect.top - MENU_HEIGHT : rect.bottom + 4,
            left: rect.right - 160,
        });
        setMenuOpen(true);
    };

    const handleDelete = () => {
        setMenuOpen(false);
        if (window.confirm(`Excluir a lista "${checklist.name}"? Esta ação não pode ser desfeita.`)) {
            onDelete();
        }
    };

    const execStatus = (checklist.execution_status ?? "pending") as ExecutionStatus;
    const execConfig = EXECUTION_STATUS_CONFIG[execStatus] ?? EXECUTION_STATUS_CONFIG.pending;

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
                ) : (
                    <span className="text-[#325a67] text-sm italic">—</span>
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

            {/* Disponibilidade */}
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

            {/* Status (execução) */}
            <td className="px-3 py-3 hidden lg:table-cell">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${execConfig.className}`}>
                    {execConfig.label}
                </span>
            </td>

            {/* Ações */}
            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="relative">
                    <button
                        ref={buttonRef}
                        onClick={handleMenuToggle}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#233f48] text-[#92bbc9] hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-[20px]">more_vert</span>
                    </button>

                    {menuOpen && menuPos && createPortal(
                        <div
                            ref={dropdownRef}
                            style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
                            className="bg-[#16262c] border border-[#233f48] rounded-xl shadow-xl min-w-[160px] py-1 overflow-hidden"
                        >
                            <button
                                onClick={() => { setMenuOpen(false); setMenuPos(null); onSelect(); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#92bbc9] hover:bg-[#233f48] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                                Visualizar
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); setMenuPos(null); onEdit(); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#92bbc9] hover:bg-[#233f48] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                Editar
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); setMenuPos(null); onDuplicate(); }}
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
                        </div>,
                        document.body
                    )}
                </div>
            </td>
        </tr>
    );
}
