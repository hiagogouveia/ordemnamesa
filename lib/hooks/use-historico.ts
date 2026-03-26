'use client';

import { useMemo } from 'react';
import { useHistoricoUsuario } from '@/lib/hooks/use-execucoes';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HistoricoEntry {
    id: string;
    task_id: string;
    checklist_id: string;
    status: 'done' | 'skipped' | 'flagged';
    executed_at: string;
    photo_url: string | null;
    notes: string | null;
    checklist_tasks: { title: string; is_critical: boolean } | null;
    checklists: { name: string; category: string | null } | null;
}

export type HistoricoFilter = 'all' | 'done' | 'skipped' | 'flagged';

export interface HistoricoOptions {
    page:   number;
    search: string;
    filter: HistoricoFilter;
    date:   string; // 'YYYY-MM-DD' ou ''
}

export interface HistoricoMetrics {
    total:         number;
    aprovadas:     number;
    incidentes:    number;
    pendentes:     number;
    variacaoTotal: number | null;
}

export interface UseHistoricoReturn {
    entries:   HistoricoEntry[];
    total:     number;
    metrics:   HistoricoMetrics;
    isLoading: boolean;
    error:     Error | null;
}

export const PAGE_SIZE = 10;

const EMPTY_METRICS: HistoricoMetrics = {
    total: 0, aprovadas: 0, incidentes: 0, pendentes: 0, variacaoTotal: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHistorico(
    restaurantId: string | null,
    userId: string | null,
    options: HistoricoOptions,
): UseHistoricoReturn {
    const { page, search, filter, date } = options;

    // filter e date são tratados no servidor.
    // search é aplicado client-side apenas sobre os PAGE_SIZE itens retornados
    // (custo mínimo — não justifica uma query extra no banco).
    const { data, isLoading, error } = useHistoricoUsuario(
        restaurantId,
        userId,
        { page, filter, date, limit: PAGE_SIZE },
    );

    const entries = useMemo<HistoricoEntry[]>(() => {
        const raw: HistoricoEntry[] = data?.entries ?? [];
        if (!search.trim()) return raw;

        const term = search.toLowerCase();
        return raw.filter(e =>
            e.checklist_tasks?.title?.toLowerCase().includes(term) ||
            e.checklists?.name?.toLowerCase().includes(term) ||
            e.checklists?.category?.toLowerCase().includes(term)
        );
    }, [data?.entries, search]);

    return {
        entries,
        total:     data?.total   ?? 0,
        metrics:   data?.metrics ?? EMPTY_METRICS,
        isLoading,
        error: error as Error | null,
    };
}
