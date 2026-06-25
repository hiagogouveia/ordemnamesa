import type { Checklist, ChecklistTask } from "@/lib/types";
import { describeRecurrence } from "@/lib/utils/recurrence/describe";
import { formatShiftNames, shiftLabel } from "@/lib/utils/shift-labels";

/**
 * Camada de transformação: converte o modelo `Checklist` (e suas tasks) em
 * estruturas prontas para render no PDF. Mantém a lógica de "mostrar apenas
 * campos com valor" fora dos componentes visuais (SOLID — uma responsabilidade).
 *
 * Reusa utilitários já existentes do projeto (describeRecurrence, shift-labels)
 * para não duplicar regras de negócio.
 */

export type PdfIconName =
    | "area"
    | "category"
    | "type"
    | "shift"
    | "recurrence"
    | "time"
    | "responsible"
    | "role"
    | "required"
    | "sequential"
    | "photo"
    | "observation"
    | "critical"
    | "value";

export interface RoutineFieldRow {
    icon: PdfIconName;
    label: string;
    value: string;
}

export interface RoutineStep {
    title: string;
    description?: string;
    badges: string[];
}

export interface RoutineSectionData {
    name: string;
    areaName?: string;
    areaColor?: string;
    description?: string;
    fields: RoutineFieldRow[];
    steps: RoutineStep[];
}

export interface RotinasDocumentData {
    restaurantName: string;
    logoDataUrl?: string;
    /** Logo do Ordem na Mesa (rodapé) — marca do produto no documento. */
    brandLogoDataUrl?: string;
    exportedBy: string;
    generatedAt: string;
    routineCount: number;
    routines: RoutineSectionData[];
}

const CHECKLIST_TYPE_LABELS: Record<
    NonNullable<Checklist["checklist_type"]>,
    string
> = {
    regular: "Regular",
    opening: "Abertura",
    closing: "Fechamento",
    receiving: "Recebimento",
};

function trimmed(value: string | null | undefined): string | undefined {
    const v = value?.trim();
    return v ? v : undefined;
}

/** Janela de horário "HH:mm – HH:mm" (ou só um lado, se for o caso). */
function formatTimeWindow(checklist: Checklist): string | undefined {
    const start = trimmed(checklist.start_time);
    const end = trimmed(checklist.end_time);
    if (start && end) return `${start} – ${end}`;
    if (start) return `A partir de ${start}`;
    if (end) return `Até ${end}`;
    return undefined;
}

function buildFields(checklist: Checklist): RoutineFieldRow[] {
    const fields: RoutineFieldRow[] = [];
    const push = (icon: PdfIconName, label: string, value?: string) => {
        if (value) fields.push({ icon, label, value });
    };

    push("area", "Área", trimmed(checklist.area?.name));
    push("category", "Categoria", trimmed(checklist.category));

    // Tipo: "regular" é o padrão silencioso — só destacamos tipos operacionais.
    if (checklist.checklist_type && checklist.checklist_type !== "regular") {
        push("type", "Tipo", CHECKLIST_TYPE_LABELS[checklist.checklist_type]);
    }

    // Turno: N:N resolvido tem prioridade; fallback p/ enum legado.
    const shiftValue =
        checklist.shifts && checklist.shifts.length > 0
            ? formatShiftNames(checklist.shifts)
            : checklist.shift && checklist.shift !== "any"
              ? shiftLabel(checklist.shift)
              : undefined;
    push("shift", "Turno", shiftValue);

    const recurrence = describeRecurrence({
        recurrence: checklist.recurrence,
        recurrence_config: checklist.recurrence_config,
    });
    if (recurrence && recurrence !== "Sem recorrência") {
        push("recurrence", "Recorrência", recurrence);
    }

    push("time", "Horário", formatTimeWindow(checklist));
    push("responsible", "Responsável", trimmed(checklist.responsible?.name));
    push("role", "Cargo", trimmed(checklist.roles?.name));

    if (checklist.is_required) push("required", "Obrigatória", "Sim");
    if (checklist.enforce_sequential_order) {
        push("sequential", "Execução", "Em ordem sequencial");
    }

    return fields;
}

function buildStepBadges(task: ChecklistTask): string[] {
    const badges: string[] = [];
    if (task.is_critical) badges.push("Crítica");
    if (task.requires_photo) badges.push("Foto");
    if (task.requires_observation) badges.push("Observação");
    if (task.type === "number") {
        const min = task.task_config?.min_value;
        const max = task.task_config?.max_value;
        if (min != null && max != null) badges.push(`Valor (${min}–${max})`);
        else badges.push("Valor");
    } else if (task.type === "rating") {
        badges.push("Nota");
    } else if (task.type === "date") {
        badges.push("Data");
    }
    return badges;
}

function buildSteps(checklist: Checklist): RoutineStep[] {
    const tasks = checklist.tasks ?? [];
    return [...tasks]
        .sort((a, b) => a.order - b.order)
        .map((task) => ({
            title: task.title,
            description: trimmed(task.description),
            badges: buildStepBadges(task),
        }));
}

export function buildRoutineSection(checklist: Checklist): RoutineSectionData {
    return {
        name: checklist.name,
        areaName: trimmed(checklist.area?.name),
        areaColor: trimmed(checklist.area?.color),
        description: trimmed(checklist.description),
        fields: buildFields(checklist),
        steps: buildSteps(checklist),
    };
}

export interface BuildDocumentParams {
    checklists: Checklist[];
    restaurantName: string;
    exportedBy: string;
    generatedAt: string;
    logoDataUrl?: string;
    brandLogoDataUrl?: string;
}

export function buildDocumentData(
    params: BuildDocumentParams,
): RotinasDocumentData {
    return {
        restaurantName: params.restaurantName,
        logoDataUrl: params.logoDataUrl,
        brandLogoDataUrl: params.brandLogoDataUrl,
        exportedBy: params.exportedBy,
        generatedAt: params.generatedAt,
        routineCount: params.checklists.length,
        routines: params.checklists.map(buildRoutineSection),
    };
}
