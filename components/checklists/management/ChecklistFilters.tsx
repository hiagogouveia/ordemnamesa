"use client";

import { useState } from "react";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import type { Area } from "@/lib/types";
import type { EquipeMember } from "@/lib/hooks/use-equipe";
import type { Unit } from "@/lib/hooks/use-units";
import type { AssignmentOrigin } from "@/lib/utils/filter-checklists-by-collaborator";

const SHIFT_OPTIONS = [
    { value: "", label: "Todos" },
    { value: "morning", label: "Manhã" },
    { value: "afternoon", label: "Tarde" },
    { value: "evening", label: "Noite" },
];

// s96: "Hoje" saiu daqui e virou a barra de Ocorrência prevista
// (OccurrenceFilterBar), que cobre hoje, amanhã, cada dia da semana, semana, mês
// e data específica. Este dropdown voltou a ser só sobre o estado da rotina.
// URLs antigas com ?availability=today seguem funcionando — a página traduz.
const AVAILABILITY_OPTIONS = [
    { value: "active", label: "Ativas" },
    { value: "inactive", label: "Inativas" },
    { value: "all", label: "Todas" },
];

// s61: removido "Recebimentos" (módulo dedicado em /recebimentos).
// Tipos operacionais explicitados (regular/opening/closing) — mais útil que a
// pílula genérica "Operacionais" anterior.
const TYPE_OPTIONS = [
    { value: "all",      label: "Todos os tipos" },
    { value: "regular",  label: "Regular" },
    { value: "opening",  label: "Abertura" },
    { value: "closing",  label: "Fechamento" },
];

// Origem da atribuição — só relevante quando um Colaborador está selecionado.
// Permite diferenciar responsabilidades individuais das herdadas da área.
const ASSIGNMENT_ORIGIN_OPTIONS = [
    { value: "all",    label: "Todas" },
    { value: "direct", label: "Apenas atribuídas ao colaborador" },
    { value: "area",   label: "Apenas atribuídas à área" },
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
    /**
     * s96 — o status de execução é sempre o do DIA CORRENTE. Quando o gestor
     * está olhando outro dia pela barra de ocorrência, o dropdown é ocultado:
     * combinar os dois produziria resultados enganosos. Default `true`.
     */
    showExecStatus?: boolean;
    selectedType: "all" | "regular" | "opening" | "closing";
    onTypeChange: (value: "all" | "regular" | "opening" | "closing") => void;
    collaborators: EquipeMember[];
    selectedCollaboratorId: string;
    onCollaboratorChange: (userId: string) => void;
    selectedAssignmentOrigin: AssignmentOrigin;
    onAssignmentOriginChange: (value: AssignmentOrigin) => void;
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
    showExecStatus = true,
    selectedType,
    onTypeChange,
    collaborators,
    selectedCollaboratorId,
    onCollaboratorChange,
    selectedAssignmentOrigin,
    onAssignmentOriginChange,
    units,
    selectedUnitId,
    onUnitChange,
    showUnitFilter,
}: ChecklistFiltersProps) {
    const [mobileOpen, setMobileOpen] = useState(false);

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

    // s96 — quantos filtros DIVERGEM do padrão. É o que o badge comunica quando o
    // bloco está recolhido: uma lista filtrada sem explicação visível é uma
    // armadilha, então o número precisa aparecer sem exigir que se expanda.
    // "Disponibilidade: Ativas" é o default e não conta.
    const activeCount =
        (selectedType !== "all" ? 1 : 0) +
        (selectedAvailability !== "active" ? 1 : 0) +
        (selectedShift ? 1 : 0) +
        (selectedAreaId ? 1 : 0) +
        (showExecStatus && selectedExecStatus ? 1 : 0) +
        (selectedCollaboratorId ? 1 : 0) +
        (selectedCollaboratorId && selectedAssignmentOrigin !== "all" ? 1 : 0) +
        (showUnitFilter && selectedUnitId ? 1 : 0);

    return (
        <div className="shrink-0 px-4 py-3 border-b border-[#233f48] bg-[#0a1215]">
            {/* s96 — no celular estes 6 dropdowns quebravam em 3 linhas e empurravam
                a lista para baixo da dobra. Recolhidos por padrão: são refinamentos
                ocasionais, não a pergunta principal (essa é a barra de ocorrência,
                que fica sempre visível). No desktop nada muda — há espaço de sobra. */}
            <button
                type="button"
                onClick={() => setMobileOpen((v) => !v)}
                aria-expanded={mobileOpen}
                aria-controls="checklist-filtros-secundarios"
                className={`md:hidden w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    activeCount > 0
                        ? "bg-[#13b6ec]/15 border-[#13b6ec]/40 text-[#13b6ec]"
                        : "bg-[#16262c] border-[#233f48] text-[#92bbc9]"
                }`}
            >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                Filtros
                {activeCount > 0 && (
                    <span className="min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-[#13b6ec] text-[#0a1215] text-[11px] font-bold">
                        {activeCount}
                    </span>
                )}
                <span
                    className={`material-symbols-outlined text-[18px] ml-auto transition-transform ${
                        mobileOpen ? "rotate-180" : ""
                    }`}
                >
                    expand_more
                </span>
            </button>

            <div
                id="checklist-filtros-secundarios"
                className={`${mobileOpen ? "flex mt-3" : "hidden"} md:flex md:mt-0 items-center gap-2 flex-wrap`}
            >
            <FilterDropdown
                label="Tipo"
                options={TYPE_OPTIONS}
                value={selectedType}
                onChange={(v) => onTypeChange(v as "all" | "regular" | "opening" | "closing")}
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
            {showExecStatus && (
                <FilterDropdown
                    label="Status"
                    options={EXEC_STATUS_OPTIONS}
                    value={selectedExecStatus}
                    onChange={onExecStatusChange}
                />
            )}
            <FilterDropdown
                label="Colaborador"
                options={collaboratorOptions}
                value={selectedCollaboratorId}
                onChange={onCollaboratorChange}
            />
            {selectedCollaboratorId && (
                <FilterDropdown
                    label="Origem"
                    options={ASSIGNMENT_ORIGIN_OPTIONS}
                    value={selectedAssignmentOrigin}
                    onChange={(v) => onAssignmentOriginChange(v as AssignmentOrigin)}
                />
            )}
            {showUnitFilter && onUnitChange && (
                <FilterDropdown
                    label="Unidade"
                    options={unitOptions}
                    value={selectedUnitId ?? ""}
                    onChange={onUnitChange}
                />
            )}
            </div>
        </div>
    );
}
