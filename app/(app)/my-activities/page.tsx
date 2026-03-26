"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useMyActivities } from "@/lib/hooks/use-my-activities";
import { AreaFilterBar } from "@/components/my-activities/area-filter-bar";
import { ActivitySection } from "@/components/my-activities/activity-section";
import type { MyActivity } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = {
    owner: "Proprietário",
    manager: "Gerente",
    staff: "Colaborador",
};

export default function MyActivitiesPage() {
    const router = useRouter();
    const { restaurantId, userRole } = useRestaurantStore();
    const [activeAreaId, setActiveAreaId] = useState<string | "all">("all");
    const [currentMinutes, setCurrentMinutes] = useState(0);

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

    // Derivar funções únicas das atividades (vêm como 'area' na resposta, estrutura idêntica)
    const areas = useMemo(() => {
        const seen = new Set<string>();
        return activities
            .filter((a) => a.area != null)
            .map((a) => a.area!)
            .filter((area) => {
                if (seen.has(area.id)) return false;
                seen.add(area.id);
                return true;
            });
    }, [activities]);

    // Client-side filter por função
    const filtered = useMemo<MyActivity[]>(() => {
        if (activeAreaId === "all") return activities;
        return activities.filter((a) => a.area_id === activeAreaId);
    }, [activities, activeAreaId]);

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
                            {activeAreaId !== "all"
                                ? "Nenhuma atividade nesta área."
                                : "Nenhuma atividade atribuída ao seu perfil no momento."}
                        </p>
                    </div>
                )}

                {/* Sections */}
                {!isLoading && !error && filtered.length > 0 && (
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
            </div>
        </div>
    );
}
