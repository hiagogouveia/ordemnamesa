import type { TaskType, TaskConfig } from '@/lib/types';

export type ResolvedTaskType = TaskType;

export function resolveTaskType(type: TaskType | null | undefined): ResolvedTaskType {
    return type ?? 'boolean';
}

export interface TaskValueInput {
    type: TaskType | null | undefined;
    value_boolean?: boolean | null;
    value_date?: string | null;
    value_number?: number | null;
    value_rating?: number | null;
    config?: TaskConfig | null;
}

function todayBrazilDateKey(): string {
    const now = new Date();
    const tz = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return tz.format(now);
}

export function computeTaskAlert(input: TaskValueInput): boolean {
    const t = resolveTaskType(input.type);

    if (t === 'date') {
        if (!input.value_date) return false;
        return input.value_date < todayBrazilDateKey();
    }

    if (t === 'number') {
        if (input.value_number === null || input.value_number === undefined) return false;
        const cfg = input.config;
        if (!cfg) return false;
        const min = cfg.min_value;
        const max = cfg.max_value;
        if (typeof min === 'number' && input.value_number < min) return true;
        if (typeof max === 'number' && input.value_number > max) return true;
        return false;
    }

    if (t === 'rating') {
        if (input.value_rating === null || input.value_rating === undefined) return false;
        return input.value_rating <= 3;
    }

    return false;
}
