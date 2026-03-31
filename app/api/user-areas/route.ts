import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

// GET /api/user-areas?restaurant_id=X&user_id=Y (optional: filter by specific user)
// Returns area assignments. If user_id is omitted, returns all assignments for the restaurant.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const user_id = searchParams.get('user_id'); // optional filter

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        // Verify caller is a member of this restaurant
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Acesso não encontrado.' }, { status: 403 });
        }

        let query = adminSupabase
            .from('user_areas')
            .select('id, user_id, area_id, created_at, area:areas(id, name, color, priority_mode)')
            .eq('restaurant_id', restaurant_id);

        if (user_id) {
            query = query.eq('user_id', user_id);
        }

        const { data, error } = await query;
        if (error) {
            console.error('[GET /api/user-areas] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error: unknown) {
        console.error('[GET /api/user-areas] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

// POST /api/user-areas — assign user to area
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, user_id, area_id } = body as {
            restaurant_id: string;
            user_id: string;
            area_id: string;
        };

        if (!restaurant_id || !user_id || !area_id) {
            return NextResponse.json({ error: 'restaurant_id, user_id e area_id são obrigatórios.' }, { status: 400 });
        }

        // Caller must be owner or manager
        const { data: callerRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!callerRole || callerRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        const { data, error } = await adminSupabase
            .from('user_areas')
            .insert({ restaurant_id, user_id, area_id })
            .select('id, user_id, area_id, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Usuário já pertence a esta área.' }, { status: 409 });
            }
            console.error('[POST /api/user-areas] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/user-areas] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
