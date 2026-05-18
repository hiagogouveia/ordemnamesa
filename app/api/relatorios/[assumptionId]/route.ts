/**
 * GET /api/relatorios/[assumptionId]
 *
 * Detalhe completo de uma execução para o painel de auditoria e a página de
 * impressão (PDF). Gera signed URLs sob demanda — somente aqui, nunca na lista.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveGlobalScope, isGlobalScopeResult } from '@/lib/api/global-scope';
import { fetchAuditDetail } from '@/lib/services/audit-service';
import type { UnitInfo } from '@/lib/types/audit';

const getAdminSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface ScopeResolution {
    restaurantIds: string[];
    unitsById: Record<string, UnitInfo>;
    isGlobal: boolean;
}

async function resolveScope(
    request: Request,
    admin: SupabaseClient,
    userId: string,
): Promise<ScopeResolution | NextResponse> {
    const { searchParams } = new URL(request.url);
    const restaurant_id = searchParams.get('restaurant_id');
    const account_id = searchParams.get('account_id');
    const isGlobal = searchParams.get('mode') === 'global';

    if (isGlobal) {
        if (!account_id) {
            return NextResponse.json(
                { error: 'account_id é obrigatório em modo global' },
                { status: 400 },
            );
        }
        const result = await resolveGlobalScope(admin, account_id, userId);
        if (!isGlobalScopeResult(result)) return result;
        return { restaurantIds: result.restaurantIds, unitsById: result.unitsById, isGlobal: true };
    }

    if (!restaurant_id) {
        return NextResponse.json(
            { error: 'restaurant_id é obrigatório' },
            { status: 400 },
        );
    }

    const { data: membership } = await admin
        .from('restaurant_users')
        .select('role')
        .eq('restaurant_id', restaurant_id)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();

    if (!membership || membership.role === 'staff') {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    return { restaurantIds: [restaurant_id], unitsById: {}, isGlobal: false };
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ assumptionId: string }> },
) {
    try {
        const { assumptionId } = await params;
        if (!assumptionId) {
            return NextResponse.json({ error: 'assumptionId obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const admin = getAdminSupabase();
        const { data: { user }, error: userError } = await admin.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Sem autorização' }, { status: 401 });
        }

        const scope = await resolveScope(request, admin, user.id);
        if (scope instanceof NextResponse) return scope;

        const detail = await fetchAuditDetail(
            admin,
            assumptionId,
            scope.restaurantIds,
            scope.unitsById,
            scope.isGlobal,
        );

        if (!detail) {
            return NextResponse.json({ error: 'Execução não encontrada' }, { status: 404 });
        }

        return NextResponse.json(detail);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
