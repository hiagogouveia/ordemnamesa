import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Autorização multi-tenant para route handlers que usam o client service-role
 * (o service-role bypassa RLS, então a membership precisa ser revalidada à mão).
 *
 * Confirma que `userId` é membro ATIVO de `restaurantId` e, opcionalmente, que
 * tem um dos `roles` permitidos. Retorna `{ role }` em caso de sucesso ou um
 * `NextResponse` de erro (401/403) pronto para `return`.
 *
 * Uso:
 *   const membership = await verifyMembership(adminSupabase, user.id, restaurant_id);
 *   if (membership instanceof NextResponse) return membership;
 *   // membership.role disponível aqui
 */
export async function verifyMembership(
    admin: SupabaseClient,
    userId: string,
    restaurantId: string | null | undefined,
    opts?: { roles?: string[] }
): Promise<{ role: string } | NextResponse> {
    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
    }

    const { data: membership } = await admin
        .from('restaurant_users')
        .select('role')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();

    if (!membership) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    if (opts?.roles && !opts.roles.includes(membership.role)) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    return { role: membership.role };
}
