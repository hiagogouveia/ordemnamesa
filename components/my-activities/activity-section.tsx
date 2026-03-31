"use client";

import { MyActivityCard } from "./my-activity-card";
import type { MyActivity } from "@/lib/types";

interface ActivitySectionProps {
    title: string;
    icon: string;
    iconColor: string;
    activities: MyActivity[];
    currentMinutes: number;
    currentUserId?: string;
    onActivityClick: (id: string) => void;
    collapsible?: boolean;
    defaultOpen?: boolean;
}

export function ActivitySection({
    title,
    icon,
    iconColor,
    activities,
    currentMinutes,
    currentUserId,
    onActivityClick,
    collapsible = false,
    defaultOpen = true,
}: ActivitySectionProps) {
    if (activities.length === 0) return null;

    const header = (
        <div className="flex items-center gap-2 mb-3">
            <span className={`material-symbols-outlined text-[18px]`} style={{ color: iconColor }}>
                {icon}
            </span>
            <span className="text-sm font-bold text-white">{title}</span>
            <span className="text-xs font-bold bg-[#16262c] text-[#92bbc9] border border-[#233f48] px-2 py-0.5 rounded-full">
                {activities.length}
            </span>
        </div>
    );

    const list = (
        <div className="flex flex-col gap-3">
            {activities.map((activity) => (
                <MyActivityCard
                    key={activity.id}
                    activity={activity}
                    currentMinutes={currentMinutes}
                    currentUserId={currentUserId}
                    onClick={() => onActivityClick(activity.id)}
                />
            ))}
        </div>
    );

    if (collapsible) {
        return (
            <details open={defaultOpen} className="group">
                <summary className="list-none cursor-pointer flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[16px] text-[#325a67] group-open:rotate-90 transition-transform">
                        chevron_right
                    </span>
                    <span className={`material-symbols-outlined text-[18px]`} style={{ color: iconColor }}>
                        {icon}
                    </span>
                    <span className="text-sm font-bold text-white">{title}</span>
                    <span className="text-xs font-bold bg-[#16262c] text-[#92bbc9] border border-[#233f48] px-2 py-0.5 rounded-full">
                        {activities.length}
                    </span>
                </summary>
                {list}
            </details>
        );
    }

    return (
        <div>
            {header}
            {list}
        </div>
    );
}
