import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canUseGlobal } from '@/lib/supabase/accounts';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface GlobalScopeResult {
    restaurantIds: string[];
    unitsById: Record<string, { id: string; name: string }>;
}

// ─── resolveGlobalScope ──────────────────────────────────────────────────────

/**
 * Resolve e VALIDA o escopo global server-side.
 *
 * - Verifica que o usuário TEM permissão de visão global na account
 * - Retorna apenas os restaurantIds que o usuário pode acessar
 * - Retorna NextResponse 403 se não autorizado
 *
 * O frontend envia apenas `accountId` — este helper resolve
 * `restaurantIds[]` via DB, sem confiar em nenhum ID vindo do client.
 */
export async function resolveGlobalScope(
    adminSupabase: SupabaseClient,
    accountId: string,
    userId: string
): Promise<GlobalScopeResult | NextResponse> {
    const { allowed, units } = await canUseGlobal(adminSupabase, accountId, userId);

    if (!allowed) {
        return NextResponse.json(
            { error: 'Acesso negado à Visão Global.' },
            { status: 403 }
        );
    }

    const unitsById: Record<string, { id: string; name: string }> = {};
    for (const u of units) {
        unitsById[u.id] = { id: u.id, name: u.name };
    }

    return {
        restaurantIds: units.map((u) => u.id),
        unitsById,
    };
}

// ─── rejectIfGlobal ──────────────────────────────────────────────────────────

/**
 * Guard para bloquear operações de escrita (POST/PUT/PATCH/DELETE)
 * quando em modo global. Retorna NextResponse 403 se bloqueado, null se ok.
 */
export function rejectIfGlobal(request: Request): NextResponse | null {
    const mode = new URL(request.url).searchParams.get('mode');
    if (mode === 'global') {
        return NextResponse.json(
            { error: 'Operação bloqueada em Visão Global. Selecione uma unidade.' },
            { status: 403 }
        );
    }
    return null;
}

// ─── isGlobalScopeResult ─────────────────────────────────────────────────────

/**
 * Type guard para distinguir GlobalScopeResult de NextResponse (erro).
 */
export function isGlobalScopeResult(
    result: GlobalScopeResult | NextResponse
): result is GlobalScopeResult {
    return 'restaurantIds' in result;
}
