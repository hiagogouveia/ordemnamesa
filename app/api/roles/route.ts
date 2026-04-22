import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canCreateResources } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

async function getUser(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return { user: null, error: 'Token ausente' };
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await getAdminSupabase().auth.getUser(token);
    return { user: error ? null : user, error: error?.message };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const { user, error: authErr } = await getUser(request);
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado' }, { status: 401 });
        }

        const adminSupabase = getAdminSupabase();

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { data, error } = await adminSupabase
            .from('roles')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .order('name');

        if (error) {
            console.error('[GET /api/roles]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error: unknown) {
        console.error('[GET /api/roles] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { user, error: authErr } = await getUser(request);
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, color, max_concurrent_tasks, can_launch_purchases } = body;

        if (!restaurant_id || !name) {
            return NextResponse.json({ error: 'Campos obrigatórios: restaurant_id, name' }, { status: 400 });
        }

        const adminSupabase = getAdminSupabase();

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership || !['owner', 'manager'].includes(membership.role)) {
            return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
        }

        // Enforcement billing
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canCreateResources(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        const { data, error } = await adminSupabase
            .from('roles')
            .insert({
                restaurant_id,
                name,
                color: color || '#13b6ec',
                max_concurrent_tasks: max_concurrent_tasks ?? 1,
                can_launch_purchases: can_launch_purchases ?? false,
            })
            .select()
            .single();

        if (error) {
            console.error('[POST /api/roles]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/roles] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
