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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const user_id = searchParams.get('user_id');
        const role_id = searchParams.get('role_id');

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

        let query = adminSupabase
            .from('user_roles')
            .select('*, role:roles(*), user:users(id, name, email, avatar_url)')
            .eq('restaurant_id', restaurant_id);

        if (user_id) query = query.eq('user_id', user_id);
        if (role_id) query = query.eq('role_id', role_id);

        const { data, error } = await query;

        if (error) {
            console.error('[GET /api/user-roles]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error: unknown) {
        console.error('[GET /api/user-roles] Erro inesperado:', error);
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
        const { restaurant_id, user_id, role_id } = body;

        if (!restaurant_id || !user_id || !role_id) {
            return NextResponse.json({ error: 'Campos obrigatórios: restaurant_id, user_id, role_id' }, { status: 400 });
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

        // Verificar UNIQUE antes de inserir
        const { data: existing } = await adminSupabase
            .from('user_roles')
            .select('id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user_id)
            .eq('role_id', role_id)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ error: 'Usuário já possui essa função' }, { status: 409 });
        }

        const { data, error } = await adminSupabase
            .from('user_roles')
            .insert({ restaurant_id, user_id, role_id })
            .select('*, role:roles(*), user:users(id, name, email, avatar_url)')
            .single();

        if (error) {
            console.error('[POST /api/user-roles]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/user-roles] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
