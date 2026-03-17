import { Checklist } from "@/lib/types";

export const ChecklistPriorityLevel = {
    ACTIVE: 1,
    NO_TIME: 2,
    FUTURE: 3,
    LATE: 4,
} as const;

export type PriorityLevel = typeof ChecklistPriorityLevel[keyof typeof ChecklistPriorityLevel];

/** Extrai valor numérico de HH:MM para comparações */
export const parseTime = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

/**
 * Avalia a prioridade do checklist (rotina) baseada no horário "now" (em minutos)
 */
export function getChecklistPriority(checklist: Partial<Checklist>, currentMinutes: number): PriorityLevel {
    const start = checklist.start_time && typeof checklist.start_time === 'string' ? parseTime(checklist.start_time) : null;
    const end = checklist.end_time && typeof checklist.end_time === 'string' ? parseTime(checklist.end_time) : null;

    if (start === null && end === null) {
        return ChecklistPriorityLevel.NO_TIME;
    }

    if (start !== null && end !== null) {
        if (currentMinutes >= start && currentMinutes <= end) return ChecklistPriorityLevel.ACTIVE;
        if (currentMinutes < start) return ChecklistPriorityLevel.FUTURE;
        if (currentMinutes > end) return ChecklistPriorityLevel.LATE;
    }
    
    // Casos híbridos: só início ou só fim
    if (start !== null && end === null) {
         if (currentMinutes < start) return ChecklistPriorityLevel.FUTURE;
         return ChecklistPriorityLevel.ACTIVE; 
    }
    
    if (start === null && end !== null) {
         if (currentMinutes > end) return ChecklistPriorityLevel.LATE;
         return ChecklistPriorityLevel.ACTIVE;
    }

    return ChecklistPriorityLevel.NO_TIME; // fallback
}

/**
 * Função de Sort que considera as diretrizes temporais.
 */
export function sortChecklistsByPriority<T extends Partial<Checklist>>(a: T, b: T, currentMinutes: number): number {
    const priorityA = getChecklistPriority(a, currentMinutes);
    const priorityB = getChecklistPriority(b, currentMinutes);

    // Regra 1: Comparar pesos (Ativa > Sem Horário > Futura > Atrasada)
    if (priorityA !== priorityB) {
        return priorityA - priorityB;
    }

    // Regra 2: Desempate para ATIVAS (vence a que termina antes)
    if (priorityA === ChecklistPriorityLevel.ACTIVE) {
        const endA = a.end_time && typeof a.end_time === 'string' ? parseTime(a.end_time) : Infinity;
        const endB = b.end_time && typeof b.end_time === 'string' ? parseTime(b.end_time) : Infinity;
        if (endA !== endB) return endA - endB;
    }

    // Regra 3: Desempate para FUTURAS (vence a que começa antes)
    if (priorityA === ChecklistPriorityLevel.FUTURE) {
        const startA = a.start_time && typeof a.start_time === 'string' ? parseTime(a.start_time) : Infinity;
        const startB = b.start_time && typeof b.start_time === 'string' ? parseTime(b.start_time) : Infinity;
        if (startA !== startB) return startA - startB;
    }

    // Regra 4: Fallback
    return 0;
}
