"use client";

import { FilterDropdown } from "@/components/ui/filter-dropdown";
import type { Area } from "@/lib/types";
import type { EquipeMember } from "@/lib/hooks/use-equipe";
import type { Unit } from "@/lib/hooks/use-units";

const SHIFT_OPTIONS = [
    { value: "", label: "Todos" },
    { value: "morning", label: "Manhã" },
    { value: "afternoon", label: "Tarde" },
    { value: "evening", label: "Noite" },
];

const AVAILABILITY_OPTIONS = [
    { value: "today", label: "Hoje" },
    { value: "active", label: "Ativas" },
    { value: "inactive", label: "Inativas" },
    { value: "all", label: "Todas" },
];

const TYPE_OPTIONS = [
    { value: "all",         label: "Todos os tipos" },
    { value: "operational", label: "Operacionais" },
    { value: "receiving",   label: "Recebimentos" },
];

const EXEC_STATUS_OPTIONS = [
    { value: "",            label: "Todos" },
    { value: "incomplete",  label: "Sem área" },
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
    selectedType: "all" | "operational" | "receiving";
    onTypeChange: (value: "all" | "operational" | "receiving") => void;
    collaborators: EquipeMember[];
    selectedCollaboratorId: string;
    onCollaboratorChange: (userId: string) => void;
    /** Lista de unidades disponíveis — passar somente em visão global. */
    units?: Unit[];
    selectedUnitId?: string;
    onUnitChange?: (unitId: string) => void;
    showUnitFilter?: boolean;
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
    selectedType,
    onTypeChange,
    collaborators,
    selectedCollaboratorId,
    onCollaboratorChange,
    units,
    selectedUnitId,
    onUnitChange,
    showUnitFilter,
}: ChecklistFiltersProps) {
    const unitOptions = [
        { value: "", label: "Todas as unidades" },
        ...(units ?? [])
            .filter((u) => u.active)
            .map((u) => ({ value: u.id, label: u.name })),
    ];

    const areaOptions = [
        { value: "", label: "Todas" },
        ...(areas ?? []).map((a) => ({ value: a.id, label: a.name })),
    ];

    const collaboratorOptions = [
        { value: "", label: "Todos" },
        ...(collaborators ?? [])
            .filter((m) => m.active)
            .map((m) => ({ value: m.user_id, label: m.name })),
    ];

    return (
        <div className="shrink-0 px-4 py-3 border-b border-[#233f48] bg-[#0a1215] flex items-center gap-2 flex-wrap">
            <FilterDropdown
                label="Tipo"
                options={TYPE_OPTIONS}
                value={selectedType}
                onChange={(v) => onTypeChange(v as "all" | "operational" | "receiving")}
            />
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
            <FilterDropdown
                label="Colaborador"
                options={collaboratorOptions}
                value={selectedCollaboratorId}
                onChange={onCollaboratorChange}
            />
            {showUnitFilter && onUnitChange && (
                <FilterDropdown
                    label="Unidade"
                    options={unitOptions}
                    value={selectedUnitId ?? ""}
                    onChange={onUnitChange}
                />
            )}
        </div>
    );
}
