"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useMyActivities } from "@/lib/hooks/use-my-activities";
import { useMyAreas } from "@/lib/hooks/use-user-areas";
import { createClient } from "@/lib/supabase/client";
import { AreaFilterBar } from "@/components/my-activities/area-filter-bar";
import { ActivitySection } from "@/components/my-activities/activity-section";
import type { MyActivity, PriorityMode, Area } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = {
    owner: "Proprietário",
    manager: "Gerente",
    staff: "Colaborador",
};

export default function MyActivitiesPage() {
    const router = useRouter();
    const { restaurantId, userRole } = useRestaurantStore();
    const [activeAreaId, setActiveAreaId] = useState<string>("");
    const [currentMinutes, setCurrentMinutes] = useState(0);
    const [userId, setUserId] = useState<string | undefined>();

    // Obter userId do auth
    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            setUserId(data.user?.id ?? undefined);
        });
    }, []);

    // Update time every minute for priority calculations
    useEffect(() => {
        const computeMinutes = () => {
            const now = new Date();
            return now.getHours() * 60 + now.getMinutes();
        };
        setCurrentMinutes(computeMinutes());
        const interval = setInterval(() => setCurrentMinutes(computeMinutes()), 60_000);
        return () => clearInterval(interval);
    }, []);

    const { data: activities = [], isLoading, error } = useMyActivities(restaurantId || undefined);

    // Buscar áreas atribuídas ao usuário (fonte: user_areas)
    const { data: userAreaAssignments = [] } = useMyAreas(restaurantId || undefined, userId);

    const areas = useMemo<Area[]>(() => {
        return userAreaAssignments
            .filter((ua) => ua.area != null)
            .map((ua) => ({
                id: ua.area!.id,
                name: ua.area!.name,
                color: ua.area!.color,
                restaurant_id: restaurantId || "",
                priority_mode: (ua.area!.priority_mode as PriorityMode) ?? "auto",
                created_at: "",
            }));
    }, [userAreaAssignments, restaurantId]);

    // Auto-selecionar primeira área quando carregam
    useEffect(() => {
        if (areas.length > 0 && !activeAreaId) {
            setActiveAreaId(areas[0].id);
        }
    }, [areas, activeAreaId]);

    // priority_mode da área selecionada
    const selectedAreaPriorityMode: PriorityMode = useMemo(() => {
        if (!activeAreaId) return "auto";
        const area = areas.find((a) => a.id === activeAreaId);
        return area?.priority_mode ?? "auto";
    }, [activeAreaId, areas]);

    // Client-side filter por área
    const filtered = useMemo<MyActivity[]>(() => {
        if (!activeAreaId) return activities;
        return activities.filter((a) => a.area_id === activeAreaId);
    }, [activities, activeAreaId]);

    // Modo manual: lista única ordenada por order_index
    const manualSorted = useMemo<MyActivity[]>(() => {
        if (selectedAreaPriorityMode !== "manual") return [];
        return [...filtered].sort(
            (a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999)
        );
    }, [filtered, selectedAreaPriorityMode]);

    // Modo auto: separado por status
    const overdue = useMemo(() => filtered.filter((a) => a.activity_status === "overdue"), [filtered]);
    const pending = useMemo(() => filtered.filter((a) => a.activity_status === "pending"), [filtered]);
    const inProgress = useMemo(() => filtered.filter((a) => a.activity_status === "in_progress"), [filtered]);
    const doneTodayList = useMemo(() => filtered.filter((a) => a.activity_status === "done_today"), [filtered]);

    const totalPending = overdue.length + pending.length + inProgress.length;

    const handleActivityClick = (id: string) => {
        router.push(`/turno/atividade/${id}`);
    };

    return (
        <div className="min-h-screen bg-[#101d22] pb-24">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#101d22]/95 backdrop-blur-sm border-b border-[#233f48] px-4 pt-6 pb-4">
                <div className="max-w-xl mx-auto">
                    <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Fraunces, serif" }}>
                        Minhas Atividades
                    </h1>
                    <p className="text-[#92bbc9] text-sm mt-0.5">
                        {ROLE_LABELS[userRole ?? "staff"] ?? ""}
                        {totalPending > 0 && (
                            <span className="ml-2 bg-[#13b6ec]/20 text-[#13b6ec] text-xs font-bold px-2 py-0.5 rounded-full border border-[#13b6ec]/30">
                                {totalPending} pendente{totalPending !== 1 ? "s" : ""}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <div className="max-w-xl mx-auto px-4 pt-5 flex flex-col gap-6">
                {/* Area filter pills */}
                <AreaFilterBar
                    areas={areas}
                    activeAreaId={activeAreaId}
                    onSelect={setActiveAreaId}
                />

                {/* Priority mode indicator */}
                {activeAreaId && (
                    <div className="flex items-center gap-1.5">
                        <span
                            className={`material-symbols-outlined text-[14px] ${
                                selectedAreaPriorityMode === "auto" ? "text-emerald-400" : "text-amber-400"
                            }`}
                        >
                            {selectedAreaPriorityMode === "auto" ? "auto_mode" : "touch_app"}
                        </span>
                        <span
                            className={`text-xs font-bold ${
                                selectedAreaPriorityMode === "auto" ? "text-emerald-400" : "text-amber-400"
                            }`}
                        >
                            Ordenação: {selectedAreaPriorityMode === "auto" ? "Automática" : "Manual"}
                        </span>
                    </div>
                )}

                {/* Loading skeleton */}
                {isLoading && (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-28 bg-[#1a2c32] rounded-xl animate-pulse" />
                        ))}
                    </div>
                )}

                {/* Error state */}
                {error && !isLoading && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                        <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                        <p className="text-red-400 text-sm mt-2">Erro ao carregar atividades.</p>
                        <p className="text-[#92bbc9] text-xs mt-1">{(error as Error).message}</p>
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && !error && filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                        <span className="material-symbols-outlined text-[#325a67] text-5xl">task_alt</span>
                        <p className="text-white font-semibold">Nenhuma atividade</p>
                        <p className="text-[#92bbc9] text-sm max-w-xs">
                            Nenhuma atividade nesta área.
                        </p>
                    </div>
                )}

                {/* Content */}
                {!isLoading && !error && filtered.length > 0 && (
                    <>
                        {selectedAreaPriorityMode === "manual" ? (
                            /* Modo manual: lista única na ordem do gestor */
                            <ActivitySection
                                title="Rotinas"
                                icon="checklist"
                                iconColor="#92bbc9"
                                activities={manualSorted}
                                currentMinutes={currentMinutes}
                                onActivityClick={handleActivityClick}
                            />
                        ) : (
                            /* Modo auto: agrupado por status */
                            <>
                                <ActivitySection
                                    title="Atrasadas"
                                    icon="alarm_off"
                                    iconColor="#ef4444"
                                    activities={overdue}
                                    currentMinutes={currentMinutes}
                                    onActivityClick={handleActivityClick}
                                />
                                <ActivitySection
                                    title="Em Andamento"
                                    icon="pending_actions"
                                    iconColor="#f59e0b"
                                    activities={inProgress}
                                    currentMinutes={currentMinutes}
                                    onActivityClick={handleActivityClick}
                                />
                                <ActivitySection
                                    title="Pendentes"
                                    icon="radio_button_unchecked"
                                    iconColor="#92bbc9"
                                    activities={pending}
                                    currentMinutes={currentMinutes}
                                    onActivityClick={handleActivityClick}
                                />
                                <ActivitySection
                                    title="Concluídas"
                                    icon="task_alt"
                                    iconColor="#22c55e"
                                    activities={doneTodayList}
                                    currentMinutes={currentMinutes}
                                    onActivityClick={handleActivityClick}
                                    collapsible
                                    defaultOpen={false}
                                />
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
