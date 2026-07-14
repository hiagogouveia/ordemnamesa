/**
 * REGISTRY — identidade visual, prioridade, agrupamento e texto de cada tipo.
 *
 * Antes do s90, ícone e cor viviam em dois `Record<string, string>` soltos dentro
 * do componente do dropdown. Como a chave era `string` (e não `NotificationType`),
 * o TypeScript não cobrava nada: `PASSWORD_CHANGED_BY_ADMIN` simplesmente não
 * estava em nenhum dos dois mapas e caía num fallback genérico — em silêncio.
 *
 * Aqui o mapa é indexado por `NotificationType`. Esquecer um tipo NÃO COMPILA.
 */

import type {
    IssuePayload,
    NotificationPayloadMap,
    NotificationPriority,
    NotificationType,
    RoutineNotePayload,
    RoutineSchedulePayload,
    TransferPayload,
} from "./contract";

/** Categorias de cor (o brief pediu identidade por categoria). */
export type NotificationTone = "success" | "warning" | "danger" | "info" | "system";

export const TONE_COLORS: Record<NotificationTone, string> = {
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#13b6ec",
    system: "#92bbc9",
};

export interface NotificationDescriptor<T extends NotificationType> {
    /** Material Symbols (mesma família já usada no app). */
    icon: string;
    tone: NotificationTone;
    priority: NotificationPriority;
    /** Sem produtor; renderizável, não emitível. */
    deprecated?: true;
    /**
     * Chave de agrupamento — determinística, computada no emit e PERSISTIDA.
     * `null` ⇒ nunca agrupa. O cliente só agrupa por igualdade de chave;
     * ele nunca inventa lógica de agrupamento.
     */
    groupKey: (p: NotificationPayloadMap[T]) => string | null;
    /** Texto do card. Nunca usado para navegar — só para ler. */
    render: (p: NotificationPayloadMap[T]) => { title: string; description: string | null };
}

type Descriptors = { [T in NotificationType]: NotificationDescriptor<T> };

// Agrupa ocorrências da mesma rotina no mesmo dia → "20 novas ocorrências".
const issueGroupKey = (p: IssuePayload) => `issue:${p.checklist_id}:${p.date_key}`;

export const NOTIFICATION_DESCRIPTORS: Descriptors = {
    BLOCKER_REPORTED: {
        icon: "warning", // triângulo (impedimento)
        tone: "warning",
        priority: "critical", // trava a operação: é o que o gestor precisa ver primeiro
        groupKey: issueGroupKey,
        render: (p) => ({
            title: `Impedimento em ${p.checklist_name}`,
            description: `${p.reported_by_name} • ${p.task_title}: ${p.excerpt}`,
        }),
    },

    ISSUE_REPORTED: {
        icon: "chat", // balão (ocorrência)
        tone: "info",
        priority: "high",
        groupKey: issueGroupKey,
        render: (p) => ({
            title: `Nova ocorrência em ${p.checklist_name}`,
            description: `${p.reported_by_name} • ${p.task_title}: ${p.excerpt}`,
        }),
    },

    ISSUE_RESOLVED: {
        icon: "task_alt",
        tone: "success",
        priority: "low",
        groupKey: issueGroupKey,
        render: (p) => ({
            title: `Ocorrência resolvida em ${p.checklist_name}`,
            description: p.task_title,
        }),
    },

    TASK_COMPLETED_WITH_NOTE: {
        icon: "sticky_note_2",
        tone: "info",
        priority: "normal",
        groupKey: (p) => `note:${p.checklist_id}:${p.date_key}`,
        render: (p: RoutineNotePayload) => ({
            title: `${p.completed_by_name} deixou uma observação`,
            description: `"${p.excerpt}" — ${p.checklist_name}`,
        }),
    },

    ROUTINE_DELAYED: {
        icon: "schedule", // relógio
        tone: "danger",
        priority: "high",
        groupKey: (p: RoutineSchedulePayload) => `delayed:${p.date_key}`,
        render: (p) => ({
            title: `Rotina atrasada: ${p.checklist_name}`,
            description: p.area_name ? `Área: ${p.area_name}` : null,
        }),
    },

    RESPONSIBLE_TRANSFERRED: {
        icon: "swap_horiz", // setas
        tone: "info",
        priority: "normal",
        groupKey: () => null,
        render: (p: TransferPayload) => ({
            title: `${p.checklist_name} transferida para ${p.to_user_name}`,
            description: p.from_user_name ? `Antes: ${p.from_user_name}` : null,
        }),
    },

    PASSWORD_CHANGED_BY_ADMIN: {
        icon: "lock_reset",
        tone: "system",
        priority: "high",
        groupKey: () => null, // nunca agrupa: é sempre individual e sensível
        render: () => ({
            title: "Senha redefinida",
            description: "Sua senha foi redefinida por um gestor.",
        }),
    },

    // ── Deprecados: sem produtor. Ficam para que as linhas antigas no banco
    //    tenham ícone e texto — a UI nunca cai no vazio.
    NEW_TASK_ASSIGNED: {
        icon: "assignment_ind",
        tone: "info",
        priority: "normal",
        deprecated: true,
        groupKey: () => null,
        render: () => ({ title: "Nova tarefa atribuída", description: null }),
    },

    NEW_TASK_FOR_AREA: {
        icon: "add_task",
        tone: "success",
        priority: "normal",
        deprecated: true,
        groupKey: () => null,
        render: () => ({ title: "Nova tarefa na sua área", description: null }),
    },
};

/** Fallback para tipos fora do contrato (deploy futuro, rollback, dado corrompido). */
export const UNKNOWN_DESCRIPTOR = {
    icon: "notifications",
    tone: "system" as const,
    priority: "normal" as const,
};

/**
 * Guarda do emissor: substitui a garantia que o CHECK de `type` dava no banco
 * (removido no s90 para que adicionar um tipo não exija mais um ALTER TABLE).
 * Recusa tipo fora do contrato e tipo deprecado.
 */
export function assertEmittableType(type: string): asserts type is NotificationType {
    const d = NOTIFICATION_DESCRIPTORS[type as NotificationType];
    if (!d) {
        throw new Error(`[notifications] tipo fora do contrato: ${type}`);
    }
    if (d.deprecated) {
        throw new Error(`[notifications] tipo deprecado não pode ser emitido: ${type}`);
    }
}

export function iconFor(type: string): string {
    return NOTIFICATION_DESCRIPTORS[type as NotificationType]?.icon ?? UNKNOWN_DESCRIPTOR.icon;
}

export function colorFor(type: string): string {
    const tone = NOTIFICATION_DESCRIPTORS[type as NotificationType]?.tone ?? UNKNOWN_DESCRIPTOR.tone;
    return TONE_COLORS[tone];
}
