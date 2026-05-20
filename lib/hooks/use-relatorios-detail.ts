'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { AuditExecutionDetail } from '@/lib/types/audit';
import type { Scope } from '@/lib/types/scope';

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

export function useRelatorioDetail(
    scope: Scope | null,
    assumptionId: string | null,
) {
    const enabled = scope !== null && !!assumptionId;

    return useQuery<AuditExecutionDetail>({
        queryKey: scope && assumptionId
            ? [
                'relatorio-detail',
                scope.mode,
                scope.mode === 'global' ? scope.accountId : scope.restaurantId,
                assumptionId,
            ]
            : ['relatorio-detail', 'disabled'],
        queryFn: async () => {
            if (!scope || !assumptionId) {
                throw new Error('Escopo ou ID ausente');
            }
            const token = await getAuthToken();
            const qs = buildScopeParams(scope).toString();
            const res = await fetch(`/api/relatorios/${assumptionId}?${qs}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? 'Falha ao buscar detalhe');
            }
            return res.json();
        },
        enabled,
        // Signed URLs duram 30 min — recarregar antes disso só se o user pedir
        staleTime: 60 * 1000 * 5,
    });
}
