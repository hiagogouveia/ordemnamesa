"use client";

import { FilterDropdown } from "@/components/ui/filter-dropdown";
import type { Area } from "@/lib/types";

const SHIFT_OPTIONS = [
    { value: "", label: "Todos" },
    { value: "morning", label: "Manhã" },
    { value: "afternoon", label: "Tarde" },
    { value: "evening", label: "Noite" },
];

const AVAILABILITY_OPTIONS = [
    { value: "", label: "Todas" },
    { value: "active", label: "Ativas" },
    { value: "inactive", label: "Inativas" },
];

const EXEC_STATUS_OPTIONS = [
    { value: "",            label: "Todos" },
    { value: "not_started", label: "Disponível" },
    { value: "in_progress", label: "Em execução" },
    { value: "overdue",     label: "Atrasada" },
    { value: "blocked",     label: "Com impedimento" },
    { value: "done",        label: "Finalizada" },
];

interface ChecklistFiltersProps {
    selectedShift: string;
    onShiftChange: (shift: string) => void;
    selectedAreaId: string;
    onAreaChange: (areaId: string) => void;
    areas: Area[];
    isLoadingAreas?: boolean;
    selectedAvailability: string;
    onAvailabilityChange: (value: string) => void;
    selectedExecStatus: string;
    onExecStatusChange: (value: string) => void;
}

export function ChecklistFilters({
    selectedShift,
    onShiftChange,
    selectedAreaId,
    onAreaChange,
    areas,
    isLoadingAreas,
    selectedAvailability,
    onAvailabilityChange,
    selectedExecStatus,
    onExecStatusChange,
}: ChecklistFiltersProps) {
    const areaOptions = [
        { value: "", label: "Todas" },
        ...(areas ?? []).map((a) => ({ value: a.id, label: a.name })),
    ];

    return (
        <div className="shrink-0 px-4 py-3 border-b border-[#233f48] bg-[#0a1215] flex items-center gap-2 flex-wrap">
            <FilterDropdown
                label="Disponibilidade"
                options={AVAILABILITY_OPTIONS}
                value={selectedAvailability}
                onChange={onAvailabilityChange}
            />
            <FilterDropdown
                label="Turno"
                options={SHIFT_OPTIONS}
                value={selectedShift}
                onChange={onShiftChange}
            />
            <FilterDropdown
                label="Área"
                options={areaOptions}
                value={selectedAreaId}
                onChange={onAreaChange}
                disabled={isLoadingAreas}
            />
            <FilterDropdown
                label="Status"
                options={EXEC_STATUS_OPTIONS}
                value={selectedExecStatus}
                onChange={onExecStatusChange}
            />
        </div>
    );
}
