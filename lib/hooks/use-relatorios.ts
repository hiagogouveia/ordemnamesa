'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { filtersToSearchParams } from '@/lib/services/audit-service';
import type { AuditFilters, AuditListResponse } from '@/lib/types/audit';
import type { Scope } from '@/lib/types/scope';

export type { Scope };

const getAuthToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
};

function buildScopeParams(scope: Scope): URLSearchParams {
    const sp = new URLSearchParams();
    if (scope.mode === 'global') {
        sp.set('mode', 'global');
        sp.set('account_id', scope.accountId);
    } else {
        sp.set('restaurant_id', scope.restaurantId);
    }
    return sp;
}

/** Concatena dois URLSearchParams (filtro + escopo) em uma única query string. */
function mergeParams(scope: URLSearchParams, filters: URLSearchParams): string {
    for (const [k, v] of filters) scope.append(k, v);
    return scope.toString();
}

export function useRelatorios(scope: Scope | null, filters: AuditFilters) {
    const enabled = scope !== null;

    return useQuery<AuditListResponse>({
        queryKey: scope
            ? [
                'relatorios',
                scope.mode,
                scope.mode === 'global' ? scope.accountId : scope.restaurantId,
                filters,
            ]
            : ['relatorios', 'disabled'],
        queryFn: async () => {
            if (!scope) {
                return { entries: [], total: 0, page: filters.page, limit: filters.limit };
            }
            const token = await getAuthToken();
            const qs = mergeParams(buildScopeParams(scope), filtersToSearchParams(filters));
            const res = await fetch(`/api/relatorios?${qs}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? 'Falha ao buscar relatórios');
            }
            return res.json();
        },
        enabled,
        staleTime: 60 * 1000, // 1 min — dados de auditoria mudam pouco mas não congelar
        placeholderData: keepPreviousData, // mantém a lista visível ao paginar/filtrar
    });
}

/**
 * Dispara o download do CSV usando os filtros + escopo correntes.
 * Usa fetch + Blob para preservar o header Authorization (não dá pra anchor).
 */
export async function downloadRelatorioCsv(scope: Scope, filters: AuditFilters): Promise<void> {
    const token = await getAuthToken();
    const qs = mergeParams(buildScopeParams(scope), filtersToSearchParams(filters));
    const url = `/api/relatorios?${qs}&format=csv`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Falha ao gerar CSV');
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const cd = res.headers.get('Content-Disposition') ?? '';
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? 'auditoria.csv';

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
}
