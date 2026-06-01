import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canManageChecklists } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';

// Sprint 72 — Aplicar Kit (instalação em lote via RPC apply_kit).
// Valida auth + papel (owner/manager) + billing, depois delega à RPC transacional.

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, kit_id } = body;
        const levels: string[] = Array.isArray(body.levels) && body.levels.length > 0
            ? body.levels
            : ['obrigatorio']; // padrão: modo Essencial
        const extraTemplateIds: string[] = Array.isArray(body.extra_template_ids) ? body.extra_template_ids : [];

        if (!restaurant_id || !kit_id) {
            return NextResponse.json({ error: 'restaurant_id e kit_id são obrigatórios.' }, { status: 400 });
        }

        // Papel: owner/manager
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
        }

        // Billing: precisa poder criar recursos (trial/active)
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canManageChecklists(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        const { data, error } = await adminSupabase.rpc('apply_kit', {
            p_restaurant_id: restaurant_id,
            p_user_id: user.id,
            p_kit_id: kit_id,
            p_levels: levels,
            p_extra_template_ids: extraTemplateIds,
        });

        if (error) {
            console.error('[POST /api/checklist-kits/apply] RPC error:', error);
            return NextResponse.json({ error: 'Erro ao aplicar o kit.' }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/checklist-kits/apply] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
