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
        const status = searchParams.get('status');

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
            .from('purchase_lists')
            .select('*, items:purchase_items(*), creator:users(id, name, email, avatar_url)')
            .eq('restaurant_id', restaurant_id)
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);

        // Security filter: Se for staff, filtrar pelas areas/roles do usuário
        if (membership.role === 'staff') {
            const { data: userAreas } = await adminSupabase
                .from('user_areas')
                .select('area_id')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id);

            const { data: userRoles } = await adminSupabase
                .from('user_roles')
                .select('role_id')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id);

            const areaIds = userAreas?.map(ua => ua.area_id) || [];
            const roleIds = userRoles?.map(ur => ur.role_id) || [];
            const effectiveIds = areaIds.length > 0 ? areaIds : roleIds;

            if (effectiveIds.length > 0) {
                query = query.or(`target_area_ids.cs.{${effectiveIds.join(',')}},target_role_ids.cs.{${effectiveIds.join(',')}}`);
            } else {
                return NextResponse.json([]); // Sem áreas/cargos, não vê nada de compras
            }
        }

        const { data, error } = await query;

        if (error) {
            console.error('[GET /api/purchase-lists]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error: unknown) {
        console.error('[GET /api/purchase-lists] Erro inesperado:', error);
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
        const { restaurant_id, title, target_role_ids, notes } = body;

        if (!restaurant_id || !title) {
            return NextResponse.json({ error: 'Campos obrigatórios: restaurant_id, title' }, { status: 400 });
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

        // owner/manager podem sempre criar; staff precisa ter can_launch_purchases em alguma role
        if (!['owner', 'manager'].includes(membership.role)) {
            const { data: userRoles } = await adminSupabase
                .from('user_roles')
                .select('role:roles(can_launch_purchases)')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const canLaunch = userRoles?.some((ur: any) => ur.role?.can_launch_purchases);
            if (!canLaunch) {
                return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
            }
        }

        const { data, error } = await adminSupabase
            .from('purchase_lists')
            .insert({
                restaurant_id,
                created_by: user.id,
                title,
                target_role_ids: target_role_ids || [], // Mantém pro fallback
                target_area_ids: target_role_ids || [], // Salva nas áreas também
                notes: notes || null,
            })
            .select()
            .single();

        if (error) {
            console.error('[POST /api/purchase-lists]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/purchase-lists] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
