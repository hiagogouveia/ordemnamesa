"use client";

import { RoutineCard } from "@/components/checklists/routine-card";
import type { MyActivity } from "@/lib/types";

interface MyActivityCardProps {
    activity: MyActivity;
    currentMinutes: number;
    currentUserId?: string;
    onClick: () => void;
}

export function MyActivityCard({ activity, currentMinutes, currentUserId, onClick }: MyActivityCardProps) {
    const isDoing = activity.activity_status === "in_progress";
    const isAssumedByMe = activity.assumed_by_user_id === currentUserId;

    // Nome a exibir: "Você" se for o próprio usuário
    const displayName = activity.assumed_by_name
        ? (isAssumedByMe ? "Você" : activity.assumed_by_name)
        : undefined;

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
            assumptionName={displayName}
            isAssignedToMe={isAssumedByMe}
            onClick={onClick}
        />
    );
}
