"use client";

import { useState, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from '@/lib/supabase/client';
import { ExtendedChecklist } from "./checklist-card";
import { RoutineCard } from "./routine-card";
import { useChecklists } from "@/lib/hooks/use-checklists";
import { useRoles } from "@/lib/hooks/use-roles";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useSortedChecklists } from "@/lib/hooks/use-sorted-checklists";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";

interface ChecklistListProps {
    onSelect: (checklist: ExtendedChecklist) => void;
    selectedId: string | null;
    onRoleChange?: (roleId: string | null) => void;
}

function SortableRoutineCard({ checklist, currentMinutes, onSelect, selectedId, canReorder, isReorderMode, onMoveUp, onMoveDown, isFirst, isLast }: {
    checklist: ExtendedChecklist;
    currentMinutes: number;
    onSelect: (c: ExtendedChecklist) => void;
    selectedId: string | null;
    canReorder: boolean;
    isReorderMode: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: checklist.id,
        disabled: !canReorder || isReorderMode,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    if (isReorderMode) {
        return (
            <div ref={setNodeRef} style={style} className="flex items-center gap-2">
                <div className="flex flex-col gap-1 shrink-0">
                    <button
                        onClick={onMoveUp}
                        disabled={isFirst}
                        aria-label="Mover rotina para cima"
                        className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                            isFirst
                                ? "border-[#233f48] text-[#233f48] cursor-not-allowed"
                                : "border-[#325a67] text-[#92bbc9] hover:bg-[#13b6ec]/10 hover:border-[#13b6ec] hover:text-[#13b6ec] active:bg-[#13b6ec]/20"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
                    </button>
                    <button
                        onClick={onMoveDown}
                        disabled={isLast}
                        aria-label="Mover rotina para baixo"
                        className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                            isLast
                                ? "border-[#233f48] text-[#233f48] cursor-not-allowed"
                                : "border-[#325a67] text-[#92bbc9] hover:bg-[#13b6ec]/10 hover:border-[#13b6ec] hover:text-[#13b6ec] active:bg-[#13b6ec]/20"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                    </button>
                </div>
                <div className="flex-1 min-w-0">
                    <RoutineCard
                        variant="admin"
                        title={checklist.name}
                        description={checklist.description}
                        start_time={checklist.start_time as string | undefined}
                        end_time={checklist.end_time as string | undefined}
                        currentMinutes={currentMinutes}
                        isActiveStatus={checklist.status === 'active'}
                        adminStatusString={checklist.status}
                        itemsCount={checklist.tasks?.length || 0}
                        shift={checklist.shift}
                        routineType={checklist.checklist_type}
                        sectorName={checklist.category || checklist.roles?.name}
                        sectorColor={checklist.roles?.color}
                        isSelected={selectedId === checklist.id}
                        onClick={() => onSelect(checklist)}
                    />
                </div>
            </div>
        );
    }

    return (
        <RoutineCard
            containerRef={setNodeRef}
            containerStyle={style}
            dragHandleProps={canReorder ? { ...attributes, ...listeners } : undefined}
            variant="admin"
            title={checklist.name}
            description={checklist.description}
            start_time={checklist.start_time as string | undefined}
            end_time={checklist.end_time as string | undefined}
            currentMinutes={currentMinutes}
            isActiveStatus={checklist.status === 'active'}
            adminStatusString={checklist.status}
            itemsCount={checklist.tasks?.length || 0}
            shift={checklist.shift}
            routineType={checklist.checklist_type}
            sectorName={checklist.category || checklist.roles?.name}
            sectorColor={checklist.roles?.color}
            isSelected={selectedId === checklist.id}
            onClick={() => onSelect(checklist)}
        />
    );
}

export function ChecklistList({ onSelect, selectedId, onRoleChange }: ChecklistListProps) {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const userRole = useRestaurantStore((state) => state.userRole);
    const queryClient = useQueryClient();
    const isMobile = useIsMobile();

    const { data: checklists, isLoading, error } = useChecklists(restaurantId || undefined);
    const { data: roles = [] } = useRoles(restaurantId || undefined);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
    const [isReorderMode, setIsReorderMode] = useState(false);

    // Auto-exit reorder mode when switching to desktop
    useEffect(() => {
        if (!isMobile) setIsReorderMode(false);
    }, [isMobile]);

    // Drag permitido apenas para owner/manager E com filtro de área ativo (não "Todos")
    const canReorder = (userRole === 'owner' || userRole === 'manager') && activeRoleId !== null;

    const handleRoleChange = (roleId: string | null) => {
        setActiveRoleId(roleId);
        onRoleChange?.(roleId);
    };

    const activeRoles = roles.filter(r => r.active);

    const filteredChecklists = checklists?.filter((c: ExtendedChecklist) => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = activeRoleId === null || c.role_id === activeRoleId;
        return matchesSearch && matchesFilter;
    });

    const { sortedChecklists, currentMinutes } = useSortedChecklists(filteredChecklists);

    const [optimisticList, setOptimisticList] = useState<ExtendedChecklist[]>([]);

    useEffect(() => {
        setOptimisticList(prev => {
            if (!sortedChecklists) return prev;

            // Compara apenas o CONJUNTO de IDs (não a ordem)
            // Só reseta quando itens são adicionados/removidos, nunca por reordenação
            const prevIds = new Set(prev.map(c => c.id));
            const sortedIds = new Set(sortedChecklists.map(c => c.id));
            const sameSet =
                prevIds.size === sortedIds.size &&
                [...sortedIds].every(id => prevIds.has(id));

            if (sameSet && prev.length > 0) {
                // Mesmos itens: preserva ordem otimista, mas atualiza dados individuais
                const dataMap = new Map(sortedChecklists.map(c => [c.id, c]));
                return prev.map(c => dataMap.get(c.id) || c);
            }

            // Itens adicionados/removidos ou carga inicial: usa ordem do sort
            return sortedChecklists;
        });
    }, [sortedChecklists]);

    const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
    const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
    const sensors = useSensors(...(isMobile ? [] : [pointerSensor, keyboardSensor]));

    const performReorder = async (oldIndex: number, newIndex: number) => {
        if (oldIndex === newIndex) return;

        const previousList = optimisticList;
        const newList = arrayMove(optimisticList, oldIndex, newIndex);
        const updatedList = newList.map((item, index) => ({
            ...item,
            order_index: index
        }));

        setOptimisticList(updatedList);

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sessão expirada');

            const payload = updatedList.map(item => ({
                id: item.id,
                order_index: item.order_index
            }));

            const res = await fetch('/api/checklists/reorder', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ restaurant_id: restaurantId, checklist_orders: payload }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Erro ao reordenar rotinas');
            }

            queryClient.setQueryData(
                ['checklists', restaurantId],
                (old: ExtendedChecklist[] | undefined) => {
                    if (!old) return old;
                    const orderMap = new Map(updatedList.map(item => [item.id, item.order_index ?? 0]));
                    return old.map(c => orderMap.has(c.id) ? { ...c, order_index: orderMap.get(c.id) } : c);
                }
            );
        } catch (err) {
            console.error("Erro ao reordenar rotinas:", err);
            setOptimisticList(previousList);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = optimisticList.findIndex((c) => c.id === active.id);
        const newIndex = optimisticList.findIndex((c) => c.id === over.id);
        await performReorder(oldIndex, newIndex);
    };

    return (
        <div className="w-full md:w-[400px] lg:w-[420px] border-r border-[#233f48] bg-[#101d22] flex flex-col shrink-0 h-full">
            {/* Header Coluna */}
            <div className="p-4 border-b border-[#233f48] shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white tracking-tight">Rotinas</h2>
                        <span className="text-xs font-bold bg-[#16262c] text-[#92bbc9] border border-[#233f48] px-2 py-1 rounded-full">
                            {checklists?.length || 0}
                        </span>
                    </div>
                    {canReorder && isMobile && (
                        <button
                            onClick={() => setIsReorderMode(prev => !prev)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                isReorderMode
                                    ? "bg-[#13b6ec]/20 text-[#13b6ec] border border-[#13b6ec]/40"
                                    : "bg-[#16262c] text-[#92bbc9] border border-[#233f48] hover:border-[#325a67]"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">
                                {isReorderMode ? "check" : "swap_vert"}
                            </span>
                            {isReorderMode ? "Concluir" : "Reordenar"}
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 bg-[#16262c] border border-[#233f48] rounded-xl px-3 py-2.5 focus-within:border-[#13b6ec] focus-within:shadow-[0_0_10px_rgba(19,182,236,0.1)] transition-all">
                    <span className="material-symbols-outlined text-[#325a67] text-[20px]">search</span>
                    <input
                        type="text"
                        placeholder="Buscar listas..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none text-white text-sm w-full placeholder:text-[#325a67]"
                    />
                </div>

                {/* Filtros por Área */}
                <div className="flex gap-2 overflow-x-auto mt-4 pb-2 no-scrollbar-custom">
                    <button
                        onClick={() => handleRoleChange(null)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeRoleId === null
                            ? "bg-[#13b6ec]/20 text-[#13b6ec] border border-[#13b6ec]/30"
                            : "bg-[#16262c] text-[#92bbc9] border border-[#233f48] hover:bg-[#1a2c32] hover:text-white"
                            }`}
                    >
                        Todos
                    </button>
                    {activeRoles.map((role) => {
                        const isActive = activeRoleId === role.id;
                        return (
                            <button
                                key={role.id}
                                onClick={() => handleRoleChange(role.id)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${isActive
                                    ? "border"
                                    : "bg-[#16262c] text-[#92bbc9] border border-[#233f48] hover:bg-[#1a2c32] hover:text-white"
                                    }`}
                                style={isActive ? { borderColor: role.color, color: role.color, backgroundColor: `${role.color}20` } : {}}
                            >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isActive ? role.color : '#92bbc9' }} />
                                {role.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse bg-[#16262c] border border-[#233f48] rounded-xl h-[120px] w-full"></div>
                    ))
                ) : error ? (
                    <div className="text-center p-6 border border-red-500/30 bg-red-500/10 rounded-xl">
                        <p className="text-red-400 text-sm font-bold">Erro ao carregar</p>
                    </div>
                ) : optimisticList?.length === 0 ? (
                    <div className="text-center p-8">
                        <span className="material-symbols-outlined text-4xl text-[#325a67] mb-2">search_off</span>
                        <p className="text-[#92bbc9] text-sm">Nenhuma rotina encontrada</p>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragCancel={() => {}}>
                        <SortableContext items={optimisticList.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            {optimisticList.map((checklist: ExtendedChecklist, index: number) => (
                                <SortableRoutineCard
                                    key={checklist.id}
                                    checklist={checklist}
                                    currentMinutes={currentMinutes}
                                    onSelect={onSelect}
                                    selectedId={selectedId}
                                    canReorder={canReorder}
                                    isReorderMode={isReorderMode}
                                    isFirst={index === 0}
                                    isLast={index === optimisticList.length - 1}
                                    onMoveUp={() => performReorder(index, index - 1)}
                                    onMoveDown={() => performReorder(index, index + 1)}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </div>
    );
}
