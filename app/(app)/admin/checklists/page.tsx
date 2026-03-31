"use client";

import { useState, useMemo, useEffect } from "react";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Checklist, ChecklistAssumption } from "@/lib/types";
import { RoutineCard } from "@/components/checklists/routine-card";
import { sortChecklistsByPriority } from "@/lib/utils/checklist-priority";

function useAdminChecklistsData(restaurantId?: string) {
    return useQuery({
        queryKey: ["admin_checklists_status", restaurantId],
        queryFn: async () => {
            if (!restaurantId) return null;
            
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || '';

            const res = await fetch(`/api/admin/checklists?restaurant_id=${restaurantId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Falha ao buscar checklists do admin');
            }

            return res.json();
        },
        enabled: !!restaurantId,
        refetchInterval: 15000, 
    });
}

export default function AdminChecklists() {
    const { restaurantId } = useRestaurantStore();
    const { data, isLoading } = useAdminChecklistsData(restaurantId || undefined);
    
    const [currentTime, setCurrentTime] = useState("");
    const [activeTab, setActiveTab] = useState<"ativas" | "concluidas">("ativas");

    console.log("SISTEMA ATUALIZADO - ABA:", activeTab);
    console.log("SISTEMA ATUALIZADO - DADOS:", data);

    useEffect(() => {
        setCurrentTime(new Date().toTimeString().slice(0, 5));
        const interval = setInterval(() => setCurrentTime(new Date().toTimeString().slice(0, 5)), 60000);
        return () => clearInterval(interval);
    }, []);

    const currentMinutes = useMemo(() => {
        if (!currentTime) return 0;
        const [h, m] = currentTime.split(':').map(Number);
        return h * 60 + m;
    }, [currentTime]);

    const { activeChecklists, completedChecklists } = useMemo(() => {
        if (!data) return { activeChecklists: [], completedChecklists: [] };

        const active: (Checklist & { itemsCount: number })[] = [];
        const completed: (Checklist & { itemsCount: number, assumption: ChecklistAssumption })[] = [];

        data.checklists.forEach((checklist: any) => {
            const assumption = data.assumptions.find((a: ChecklistAssumption) => a.checklist_id === checklist.id);
            const itemsCount = data.tasks.filter((t: any) => t.checklist_id === checklist.id).length;
            
            const enrichedChecklist = { ...checklist, itemsCount };

            if (assumption?.completed_at) {
                completed.push({ ...enrichedChecklist, assumption });
            } else {
                active.push(enrichedChecklist);
            }
        });

        // Sorting: prioridade primeiro, order_index como desempate
        active.sort((a, b) => {
            const priorityDiff = sortChecklistsByPriority(a, b, currentMinutes);
            if (priorityDiff !== 0) return priorityDiff;
            return (a.order_index ?? 9999) - (b.order_index ?? 9999);
        });
        completed.sort((a, b) => {
            const timeA = new Date(a.assumption.completed_at!).getTime();
            const timeB = new Date(b.assumption.completed_at!).getTime();
            return timeB - timeA; // DESC (mais recentes no topo)
        });

        return { activeChecklists: active, completedChecklists: completed };
    }, [data, currentMinutes]);

    const displayData = activeTab === "ativas" ? activeChecklists : completedChecklists;

    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Gestão de Checklists</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Acompanhe as rotinas da sua equipe hoje</p>
                </div>

                <button className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#13b6ec] hover:bg-[#10a1d4] text-[#0a1215] font-bold py-2.5 px-6 rounded-lg shadow-lg shadow-[#13b6ec]/20 transition-all active:scale-[0.98]">
                    <span className="material-symbols-outlined text-[20px]">add</span>
                    Novo Checklist
                </button>
            </div>

            {/* Toolbar Areas */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white dark:bg-[#111e22] p-4 rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48]">
                
                {/* Tabs "Rotinas" and "Concluídas" */}
                <div className="flex bg-slate-100 dark:bg-[#1a2c32] p-1 rounded-lg w-full sm:w-auto border border-slate-200 dark:border-[#233f48]">
                    <button 
                        onClick={() => setActiveTab("ativas")}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-4 px-6 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'ativas' ? 'bg-white dark:bg-[#233f48] text-[#13b6ec] dark:text-white shadow-md' : 'text-slate-500 dark:text-[#92bbc9] hover:text-[#13b6ec] dark:hover:text-white'}`}
                    >
                        <div className="flex items-center gap-2">
                            Rotinas
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'ativas' ? 'bg-red-500 text-white' : 'bg-slate-200 dark:bg-[#111e22] text-slate-500 dark:text-[#92bbc9]'}`}>
                                {activeChecklists.length}
                            </span>
                        </div>
                    </button>
                    <button 
                        onClick={() => setActiveTab("concluidas")}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-4 px-6 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'concluidas' ? 'bg-white dark:bg-[#233f48] text-[#13b6ec] dark:text-white shadow-md' : 'text-slate-500 dark:text-[#92bbc9] hover:text-[#13b6ec] dark:hover:text-white'}`}
                    >
                        <div className="flex items-center gap-2">
                            Concluídas
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'concluidas' ? 'bg-[#13b6ec] text-white' : 'bg-slate-200 dark:bg-[#111e22] text-slate-500 dark:text-[#92bbc9]'}`}>
                                {completedChecklists.length}
                            </span>
                        </div>
                    </button>
                </div>

                {/* Filters */}
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <button className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-[#1a2c32] border border-slate-200 dark:border-[#325a67] hover:border-slate-300 dark:hover:border-primary text-slate-700 dark:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Todos os Setores
                    </button>
                    <button className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-[#1a2c32] border border-slate-200 dark:border-[#325a67] hover:border-slate-300 dark:hover:border-primary text-slate-700 dark:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">schedule</span>
                        Qualquer Turno
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="flex justify-center py-10">
                    <span className="material-symbols-outlined animate-spin text-4xl text-[#13b6ec]">progress_activity</span>
                </div>
            )}

            {/* Checklists Grid */}
            {!isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {displayData.map((item) => {
                        const isCompleted = activeTab === "concluidas";
                        const completedAssumption = isCompleted ? (item as any).assumption as ChecklistAssumption : null;
                        
                        let descriptionStr = item.description || "Sem descrição definida.";
                        
                        if (isCompleted && completedAssumption) {
                            const timeStr = new Date(completedAssumption.completed_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            
                            descriptionStr = `Finalizado por: ${completedAssumption.user_name} às ${timeStr}`;
                            if (completedAssumption.observation) {
                                descriptionStr += `\n💬 Obs: ${completedAssumption.observation}`;
                            }
                        }

                        return (
                            <div key={item.id} className="h-full flex">
                                <RoutineCard
                                    variant="admin"
                                    title={item.name}
                                    description={descriptionStr}
                                    start_time={item.start_time}
                                    end_time={item.end_time}
                                    currentMinutes={currentMinutes}
                                    itemsCount={item.itemsCount}
                                    shift={item.shift as string}
                                    sectorName={(item as any).roles?.name}
                                    sectorColor={(item as any).roles?.color}
                                    routineType={item.checklist_type}
                                    adminStatusString={isCompleted ? "archived" : "active"}
                                    onClick={() => {}}
                                />
                            </div>
                        );
                    })}

                    {/* New Checklist Card Placeholder (Only on Active tab) */}
                    {activeTab === "ativas" && (
                        <button className="bg-slate-50 dark:bg-[#152329] rounded-xl shadow-sm border-2 border-dashed border-slate-300 dark:border-[#325a67] p-6 flex flex-col items-center justify-center gap-4 hover:border-[#13b6ec] transition-colors group min-h-[200px]">
                            <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-[#233f48] flex items-center justify-center text-slate-400 group-hover:bg-[#13b6ec]/20 group-hover:text-[#13b6ec] transition-colors">
                                <span className="material-symbols-outlined text-3xl">add</span>
                            </div>
                            <span className="text-sm font-bold text-slate-600 dark:text-[#93adc8] group-hover:text-[#13b6ec] transition-colors">
                                Criar Novo Checklist
                            </span>
                        </button>
                    )}
                </div>
            )}
            
            {/* Empty State Concluídas */}
            {!isLoading && activeTab === "concluidas" && completedChecklists.length === 0 && (
                <div className="w-full flex justify-center py-20 text-[#5a7b88]">
                    <div className="text-center">
                        <span className="material-symbols-outlined text-5xl mb-3 opacity-50">inventory_2</span>
                        <p className="font-medium">Nenhuma rotina foi concluída hoje ainda.</p>
                    </div>
                </div>
            )}

        </div>
    );
}
