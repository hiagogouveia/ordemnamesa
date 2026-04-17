import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveGlobalScope, rejectIfGlobal, isGlobalScopeResult } from '@/lib/api/global-scope';

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
        const account_id = searchParams.get('account_id');
        const mode = searchParams.get('mode');
        const status = searchParams.get('status');
        const isGlobal = mode === 'global';

        if (!isGlobal && !restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }
        if (isGlobal && !account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório em modo global' }, { status: 400 });
        }

        const { user, error: authErr } = await getUser(request);
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado' }, { status: 401 });
        }

        const adminSupabase = getAdminSupabase();

        // ── Resolver escopo ───────────────────────────────────────────
        let restaurantIds: string[] = [];
        const unitsById: Record<string, { id: string; name: string }> = {};

        if (isGlobal) {
            const scopeResult = await resolveGlobalScope(adminSupabase, account_id!, user.id);
            if (!isGlobalScopeResult(scopeResult)) return scopeResult; // 403
            restaurantIds = scopeResult.restaurantIds;
            Object.assign(unitsById, scopeResult.unitsById);
        } else {
            const { data: membership } = await adminSupabase
                .from('restaurant_users')
                .select('role')
                .eq('restaurant_id', restaurant_id!)
                .eq('user_id', user.id)
                .eq('active', true)
                .single();

            if (!membership) {
                return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
            }

            // Staff filter: filtrar por areas/roles
            if (membership.role === 'staff') {
                const [{ data: userAreas }, { data: userRoles }] = await Promise.all([
                    adminSupabase
                        .from('user_areas')
                        .select('area_id')
                        .eq('restaurant_id', restaurant_id!)
                        .eq('user_id', user.id),
                    adminSupabase
                        .from('user_roles')
                        .select('role_id')
                        .eq('restaurant_id', restaurant_id!)
                        .eq('user_id', user.id),
                ]);

                const areaIds = userAreas?.map(ua => ua.area_id) || [];
                const roleIds = userRoles?.map(ur => ur.role_id) || [];
                const effectiveIds = areaIds.length > 0 ? areaIds : roleIds;

                if (effectiveIds.length === 0) {
                    return NextResponse.json([]);
                }

                let query = adminSupabase
                    .from('purchase_lists')
                    .select('*, items:purchase_items(*), creator:users(id, name, email, avatar_url)')
                    .eq('restaurant_id', restaurant_id!)
                    .or(`target_area_ids.cs.{${effectiveIds.join(',')}},target_role_ids.cs.{${effectiveIds.join(',')}}`)
                    .order('created_at', { ascending: false });

                if (status) query = query.eq('status', status);

                const { data, error } = await query;
                if (error) {
                    console.error('[GET /api/purchase-lists]', error);
                    return NextResponse.json({ error: error.message }, { status: 500 });
                }
                return NextResponse.json(data || []);
            }

            restaurantIds = [restaurant_id!];
            // Carregar nome do restaurante
            const { data: rest } = await adminSupabase
                .from('restaurants')
                .select('id, name')
                .eq('id', restaurant_id!)
                .maybeSingle<{ id: string; name: string }>();
            if (rest) unitsById[rest.id] = { id: rest.id, name: rest.name };
        }

        // ── Query principal (owner/manager ou global) ─────────────────
        let query = adminSupabase
            .from('purchase_lists')
            .select('*, items:purchase_items(*), creator:users(id, name, email, avatar_url)')
            .in('restaurant_id', restaurantIds)
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data, error } = await query;

        if (error) {
            console.error('[GET /api/purchase-lists]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Em global: adicionar unit info a cada lista
        const lists = (data || []).map((list: { restaurant_id: string }) => ({
            ...list,
            ...(isGlobal && unitsById[list.restaurant_id]
                ? { unit: unitsById[list.restaurant_id] }
                : {}),
        }));

        return NextResponse.json(lists);
    } catch (error: unknown) {
        console.error('[GET /api/purchase-lists] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const blocked = rejectIfGlobal(request);
        if (blocked) return blocked;

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
                target_role_ids: target_role_ids || [],
                target_area_ids: target_role_ids || [],
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
