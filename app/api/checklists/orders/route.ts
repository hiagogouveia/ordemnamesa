import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[GET /api/checklists/orders] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou Token inválido.' }, { status: 401 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const { data, error } = await adminSupabase
            .from('checklist_orders')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .order('position', { ascending: true });

        if (error) {
            console.error('[GET /api/checklists/orders] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    } catch (error: unknown) {
        console.error('[GET /api/checklists/orders] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[PATCH /api/checklists/orders] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou Token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, orders } = body as {
            restaurant_id: string;
            orders: Array<{ checklist_id: string; shift: string; position: number }>;
        };

        if (!restaurant_id || !Array.isArray(orders)) {
            return NextResponse.json({ error: 'restaurant_id e orders são obrigatórios.' }, { status: 400 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes.' }, { status: 403 });
        }

        const upsertData = orders.map(o => ({
            restaurant_id,
            checklist_id: o.checklist_id,
            shift: o.shift,
            position: o.position,
        }));

        const { error } = await adminSupabase
            .from('checklist_orders')
            .upsert(upsertData, { onConflict: 'checklist_id,shift' });

        if (error) {
            console.error('[PATCH /api/checklists/orders] Erro no upsert:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[PATCH /api/checklists/orders] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
