"use client";

import { useState } from "react";
import { ChecklistCard, ExtendedChecklist } from "./checklist-card";
import { useChecklists } from "@/lib/hooks/use-checklists";
import { useRestaurantStore } from "@/lib/store/restaurant-store";

interface ChecklistListProps {
    onSelect: (checklist: ExtendedChecklist) => void;
    selectedId: string | null;
}

export function ChecklistList({ onSelect, selectedId }: ChecklistListProps) {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const { data: checklists, isLoading, error } = useChecklists(restaurantId || undefined);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeFilter, setActiveFilter] = useState("Todos");

    const filters = ['Todos', 'Cozinha', 'Salão', 'Bar', 'Gerência', 'Equipe Limpeza'];

    const filteredChecklists = checklists?.filter((c: ExtendedChecklist) => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = activeFilter === "Todos" || c.category === activeFilter;
        return matchesSearch && matchesFilter;
    });

    return (
        <div className="w-full md:w-[400px] lg:w-[420px] border-r border-[#233f48] bg-[#101d22] flex flex-col shrink-0 h-full">
            {/* Header Coluna */}
            <div className="p-4 border-b border-[#233f48] shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white tracking-tight">Rotinas</h2>
                    <span className="text-xs font-bold bg-[#16262c] text-[#92bbc9] border border-[#233f48] px-2 py-1 rounded-full">
                        {checklists?.length || 0}
                    </span>
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

                {/* Filtros */}
                <div className="flex gap-2 overflow-x-auto mt-4 pb-2 no-scrollbar-custom">
                    {filters.map((filter) => {
                        const isActive = activeFilter === filter;
                        return (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${isActive
                                    ? "bg-[#13b6ec]/20 text-[#13b6ec] border border-[#13b6ec]/30"
                                    : "bg-[#16262c] text-[#92bbc9] border border-[#233f48] hover:bg-[#1a2c32] hover:text-white"
                                    }`}
                            >
                                {filter}
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
                ) : filteredChecklists?.length === 0 ? (
                    <div className="text-center p-8">
                        <span className="material-symbols-outlined text-4xl text-[#325a67] mb-2">search_off</span>
                        <p className="text-[#92bbc9] text-sm">Nenhuma rotina encontrada</p>
                    </div>
                ) : (
                    filteredChecklists?.map((checklist: ExtendedChecklist) => (
                        <ChecklistCard
                            key={checklist.id}
                            checklist={checklist}
                            isSelected={selectedId === checklist.id}
                            onClick={() => onSelect(checklist)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
