'use client';

import { useMemo } from 'react';
import { useHistoricoUsuario } from '@/lib/hooks/use-execucoes';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HistoricoEntry {
    id: string;
    task_id: string;
    checklist_id: string;
    restaurant_id: string;
    user_id: string;
    status: 'done' | 'skipped' | 'flagged';
    executed_at: string;
    photo_url: string | null;
    notes: string | null;
    checklist_tasks: { title: string; is_critical: boolean } | null;
    checklists: { name: string; category: string | null } | null;
}

export type HistoricoFilter = 'all' | 'done' | 'skipped' | 'flagged';

export interface HistoricoOptions {
    page: number;
    search: string;
    filter: HistoricoFilter;
    date: string; // 'YYYY-MM-DD' or ''
}

export interface HistoricoMetrics {
    total: number;
    aprovadas: number;
    incidentes: number;
    pendentes: number;
    variacaoTotal: number | null;
}

export interface UseHistoricoReturn {
    entries: HistoricoEntry[];
    total: number;
    metrics: HistoricoMetrics;
    isLoading: boolean;
    error: Error | null;
}

const PAGE_SIZE = 10;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHistorico(
    restaurantId: string | null,
    userId: string | null,
    options: HistoricoOptions
): UseHistoricoReturn {
    const { data: raw, isLoading, error } = useHistoricoUsuario(restaurantId, userId);

    const result = useMemo<UseHistoricoReturn>(() => {
        const allEntries: HistoricoEntry[] = Array.isArray(raw) ? (raw as HistoricoEntry[]) : [];

        // ── Metrics (full dataset) ──────────────────────────────────────────────
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

        const todayEntries = allEntries.filter(e => e.executed_at.startsWith(today));
        const yesterdayEntries = allEntries.filter(e => e.executed_at.startsWith(yesterday));

        const todayDone = todayEntries.filter(e => e.status === 'done').length;
        const yesterdayDone = yesterdayEntries.filter(e => e.status === 'done').length;

        const variacaoTotal =
            yesterdayDone === 0
                ? null
                : Math.round(((todayDone - yesterdayDone) / yesterdayDone) * 100);

        const metrics: HistoricoMetrics = {
            total: allEntries.filter(e => e.status === 'done').length,
            aprovadas: allEntries.filter(e => e.status === 'done').length,
            incidentes: allEntries.filter(e => e.status === 'flagged').length,
            pendentes: allEntries.filter(e => e.status === 'skipped').length,
            variacaoTotal,
        };

        // ── Filter ──────────────────────────────────────────────────────────────
        const { page, search, filter, date } = options;

        let filtered = allEntries;

        if (filter !== 'all') {
            filtered = filtered.filter(e => e.status === filter);
        }

        if (search.trim()) {
            const term = search.toLowerCase();
            filtered = filtered.filter(e =>
                e.checklist_tasks?.title?.toLowerCase().includes(term) ||
                e.checklists?.name?.toLowerCase().includes(term) ||
                e.checklists?.category?.toLowerCase().includes(term)
            );
        }

        if (date) {
            filtered = filtered.filter(e => e.executed_at.startsWith(date));
        }

        // ── Paginate ────────────────────────────────────────────────────────────
        const total = filtered.length;
        const start = page * PAGE_SIZE;
        const entries = filtered.slice(start, start + PAGE_SIZE);

        return { entries, total, metrics, isLoading, error: error as Error | null };
    }, [raw, options, isLoading, error]);

    return result;
}

export { PAGE_SIZE };
