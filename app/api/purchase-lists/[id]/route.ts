import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
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
            .from('purchase_lists')
            .select('*, items:purchase_items(*)')
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .single();

        if (error) {
            console.error('[GET /api/purchase-lists/[id]]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('[GET /api/purchase-lists/[id]] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const { user, error: authErr } = await getUser(request);
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, ...updates } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
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

        const allowed = ['title', 'status', 'target_role_ids', 'notes'];
        const payload: Record<string, unknown> = Object.fromEntries(
            Object.entries(updates).filter(([k]) => allowed.includes(k))
        );

        // Setar closed_at ao fechar
        if (payload.status === 'closed') {
            payload.closed_at = new Date().toISOString();
        }

        const { data, error } = await adminSupabase
            .from('purchase_lists')
            .update(payload)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .select()
            .single();

        if (error) {
            console.error('[PUT /api/purchase-lists/[id]]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('[PUT /api/purchase-lists/[id]] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
