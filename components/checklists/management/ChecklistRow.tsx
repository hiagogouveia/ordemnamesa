"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import type { ExecutionStatus } from "@/lib/types";
import { getOperationalStatus } from "@/lib/utils/get-operational-status";

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
    incomplete: {
        label: "Sem área",
        className: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    },
    not_started: {
        label: "Disponível",
        className: "bg-[#16262c] text-[#92bbc9] border-[#233f48]",
    },
    in_progress: {
        label: "Em execução",
        className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    },
    done: {
        label: "Finalizada",
        className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    },
    overdue: {
        label: "Atrasada",
        className: "bg-red-500/20 text-red-400 border-red-500/30",
    },
    blocked: {
        label: "Com impedimento",
        className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    },
};

interface ChecklistRowProps {
    checklist: ExtendedChecklist;
    isSelected: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onStatusToggle: (active: boolean) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    currentMinutes: number;
}

export function ChecklistRow({
    checklist,
    isSelected,
    onSelect,
    onEdit,
    onStatusToggle,
    onDuplicate,
    onDelete,
    currentMinutes,
}: ChecklistRowProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

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

    // Derivar status operacional centralizado
    const execStatus = getOperationalStatus(checklist, currentMinutes);
    const execConfig = EXECUTION_STATUS_CONFIG[execStatus] ?? EXECUTION_STATUS_CONFIG.not_started;

    return (
        <tr
            className={`border-b border-[#1a2c32] transition-colors cursor-pointer ${
                isSelected ? "bg-[#13b6ec]/5" : "hover:bg-[#16262c]"
            } ${checklist.status === "draft" ? "opacity-70" : (!checklist.active ? "opacity-50" : "")}`}
        >
            {/* Título */}
            <td className="px-3 py-3" onClick={onSelect}>
                <span className="font-semibold text-white text-sm">{checklist.name}</span>
                {checklist.description && (
                    <p className="text-[#92bbc9] text-xs mt-0.5 line-clamp-1">{checklist.description}</p>
                )}
            </td>

            {/* Turno */}
            <td className="px-3 py-3" onClick={onSelect}>
                <span className="text-[#92bbc9] text-sm">{SHIFT_LABELS[checklist.shift] ?? checklist.shift}</span>
            </td>

            {/* Área */}
            <td className="px-3 py-3" onClick={onSelect}>
                {checklist.area ? (
                    <span className="flex items-center gap-1.5">
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: checklist.area.color || "#325a67" }}
                        />
                        <span className="text-[#92bbc9] text-sm">{checklist.area.name}</span>
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 text-orange-400">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        <span className="text-sm font-medium">Sem área</span>
                    </span>
                )}
            </td>

            {/* Responsável / Executando */}
            <td className="px-3 py-3 hidden md:table-cell" onClick={onSelect}>
                {checklist.assumed_by_name ? (
                    <span className="flex items-center gap-1.5">
                        <span className={`material-symbols-outlined text-[14px] shrink-0 ${execStatus !== "done" ? "text-[#13b6ec]" : "text-[#5a8a99]"}`}>person</span>
                        <span className="text-white text-sm font-medium truncate">{checklist.assumed_by_name}</span>
                        {execStatus !== "done" && (
                            <span className="shrink-0 text-[9px] font-bold text-[#13b6ec] bg-[#13b6ec]/10 border border-[#13b6ec]/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                Executando
                            </span>
                        )}
                    </span>
                ) : checklist.responsible?.name ? (
                    <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px] text-[#5a8a99] shrink-0">person</span>
                        <span className="text-[#92bbc9] text-sm truncate">{checklist.responsible.name}</span>
                    </span>
                ) : (
                    <span className="text-[#325a67] text-sm italic">Distribuído para toda a área</span>
                )}
            </td>

            {/* Recorrência */}
            <td className="px-3 py-3 hidden lg:table-cell" onClick={onSelect}>
                <span className="text-[#92bbc9] text-sm">
                    {RECURRENCE_LABELS[checklist.recurrence ?? "none"] ?? "—"}
                </span>
            </td>

            {/* Disponibilidade */}
            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                {checklist.status === "draft" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">
                        <span className="inline-block w-3 h-3 rounded-full bg-amber-400" />
                        Rascunho
                    </span>
                ) : (
                    <button
                        onClick={() => onStatusToggle(!checklist.active)}
                        role="switch"
                        aria-checked={checklist.active}
                        className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer transition-all duration-200 active:scale-95 ${
                            checklist.active
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 hover:border-emerald-400/50 hover:shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                : "bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 hover:shadow-[0_0_8px_rgba(239,68,68,0.15)]"
                        }`}
                        title={checklist.active ? "Clique para desativar" : "Clique para ativar"}
                    >
                        <span className={`inline-block w-3 h-3 rounded-full transition-colors duration-200 ${
                            checklist.active
                                ? "bg-emerald-400 group-hover:bg-emerald-300"
                                : "bg-gray-500 group-hover:bg-red-400"
                        }`} />
                        {checklist.active ? "Ativo" : "Inativo"}
                    </button>
                )}
            </td>

            {/* Status (execução) */}
            <td className="px-3 py-3 hidden lg:table-cell" onClick={onSelect}>
                <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${execConfig.className}`}
                    title={execStatus === "incomplete" ? "Essa rotina não está vinculada a nenhuma área e não pode ser executada" : undefined}
                >
                    {execStatus === "incomplete" && (
                        <span className="material-symbols-outlined text-[12px]">error_outline</span>
                    )}
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
