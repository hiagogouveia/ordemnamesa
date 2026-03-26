"use client";

import { RoutineCard } from "@/components/checklists/routine-card";
import type { MyActivity } from "@/lib/types";

interface MyActivityCardProps {
    activity: MyActivity;
    currentMinutes: number;
    onClick: () => void;
}

export function MyActivityCard({ activity, currentMinutes, onClick }: MyActivityCardProps) {
    const isDoing = activity.activity_status === "in_progress";

    return (
        <RoutineCard
            variant={isDoing ? "collaborator_doing" : "collaborator_todo"}
            title={activity.name}
            description={activity.description ?? undefined}
            start_time={activity.start_time}
            end_time={activity.end_time}
            currentMinutes={currentMinutes}
            itemsCount={activity.task_count}
            isRequired={activity.is_required}
            area={activity.area?.name}
            progress={activity.progress_percent}
            onClick={onClick}
        />
    );
}
