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

type StatusTab = "active" | "completed";

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
    const [activeTab, setActiveTab] = useState<StatusTab>("active");

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

    // Separar ativas de concluídas
    const activeActivities = useMemo(() =>
        filtered.filter((a) => a.activity_status !== "done_today"),
    [filtered]);

    const completedActivities = useMemo(() =>
        filtered.filter((a) => a.activity_status === "done_today"),
    [filtered]);

    // Modo manual: lista única ordenada por order_index (apenas ativas)
    const manualSorted = useMemo<MyActivity[]>(() => {
        if (selectedAreaPriorityMode !== "manual") return [];
        const source = activeTab === "active" ? activeActivities : completedActivities;
        return [...source].sort(
            (a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999)
        );
    }, [activeActivities, completedActivities, selectedAreaPriorityMode, activeTab]);

    // Ordena: atividades do próprio usuário primeiro
    const sortByOwnership = (list: MyActivity[]) =>
        [...list].sort((a, b) => {
            const aIsMine = a.assumed_by_user_id === userId ? 0 : 1;
            const bIsMine = b.assumed_by_user_id === userId ? 0 : 1;
            return aIsMine - bIsMine;
        });

    // Modo auto: separado por status
    const overdue = useMemo(() => sortByOwnership(activeActivities.filter((a) => a.activity_status === "overdue")), [activeActivities, userId]);
    const inProgress = useMemo(() => sortByOwnership(activeActivities.filter((a) => a.activity_status === "in_progress")), [activeActivities, userId]);
    const pending = useMemo(() => sortByOwnership(activeActivities.filter((a) => a.activity_status === "pending")), [activeActivities, userId]);

    const totalActive = activeActivities.length;
    const totalCompleted = completedActivities.length;

    const handleActivityClick = (id: string) => {
        router.push(`/turno/atividade/${id}`);
    };

    return (
        <div className="min-h-screen bg-[#101d22] pb-24">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#101d22]/95 backdrop-blur-sm border-b border-[#233f48] px-4 pt-6 pb-0">
                <div className="max-w-xl mx-auto">
                    <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Fraunces, serif" }}>
                        Minhas Atividades
                    </h1>
                    <p className="text-[#92bbc9] text-sm mt-0.5 mb-4">
                        {ROLE_LABELS[userRole ?? "staff"] ?? ""}
                    </p>

                    {/* Tabs */}
                    <div className="flex gap-0 border-b border-[#233f48] -mx-4 px-4">
                        <button
                            onClick={() => setActiveTab("active")}
                            className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
                                activeTab === "active"
                                    ? "text-[#13b6ec]"
                                    : "text-[#92bbc9] hover:text-white"
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                Pendentes
                                {totalActive > 0 && (
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight ${
                                        activeTab === "active"
                                            ? "bg-[#13b6ec] text-[#0a1215]"
                                            : "bg-[#233f48] text-[#92bbc9]"
                                    }`}>
                                        {totalActive}
                                    </span>
                                )}
                            </span>
                            {activeTab === "active" && (
                                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#13b6ec] rounded-full" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab("completed")}
                            className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
                                activeTab === "completed"
                                    ? "text-emerald-400"
                                    : "text-[#92bbc9] hover:text-white"
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                Concluídas
                                {totalCompleted > 0 && (
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight ${
                                        activeTab === "completed"
                                            ? "bg-emerald-500 text-[#0a1215]"
                                            : "bg-[#233f48] text-[#92bbc9]"
                                    }`}>
                                        {totalCompleted}
                                    </span>
                                )}
                            </span>
                            {activeTab === "completed" && (
                                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-400 rounded-full" />
                            )}
                        </button>
                    </div>
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
                {activeAreaId && activeTab === "active" && (
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

                {/* Tab: Ativas */}
                {!isLoading && !error && activeTab === "active" && (
                    <>
                        {activeActivities.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                                <span className="material-symbols-outlined text-[#325a67] text-5xl">task_alt</span>
                                <p className="text-white font-semibold">Tudo em dia!</p>
                                <p className="text-[#92bbc9] text-sm max-w-xs">
                                    Nenhuma atividade pendente nesta área.
                                </p>
                            </div>
                        ) : selectedAreaPriorityMode === "manual" ? (
                            <ActivitySection
                                title="Rotinas"
                                icon="checklist"
                                iconColor="#92bbc9"
                                activities={manualSorted}
                                currentMinutes={currentMinutes}
                                currentUserId={userId}
                                onActivityClick={handleActivityClick}
                            />
                        ) : (
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
                            </>
                        )}
                    </>
                )}

                {/* Tab: Concluídas */}
                {!isLoading && !error && activeTab === "completed" && (
                    <>
                        {completedActivities.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                                <span className="material-symbols-outlined text-[#325a67] text-5xl">pending_actions</span>
                                <p className="text-white font-semibold">Nenhuma atividade concluída</p>
                                <p className="text-[#92bbc9] text-sm max-w-xs">
                                    Atividades finalizadas aparecerão aqui.
                                </p>
                            </div>
                        ) : (
                            <ActivitySection
                                title="Concluídas Hoje"
                                icon="task_alt"
                                iconColor="#22c55e"
                                activities={completedActivities}
                                currentMinutes={currentMinutes}
                                onActivityClick={handleActivityClick}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
