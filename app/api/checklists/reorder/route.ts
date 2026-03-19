import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

interface ChecklistOrderEntry {
    id: string;
    order_index: number;
}

export async function PATCH(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado ou token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, checklist_orders } = body as {
            restaurant_id: string;
            checklist_orders: ChecklistOrderEntry[];
        };

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }
        if (!Array.isArray(checklist_orders) || checklist_orders.length === 0) {
            return NextResponse.json({ error: 'checklist_orders deve ser um array não-vazio.' }, { status: 400 });
        }

        // Verificar permissão
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

        // Validação multi-tenant: confirmar que todos os IDs pertencem a este restaurante
        const incomingIds = checklist_orders.map(c => c.id);
        const { data: existing, error: fetchError } = await adminSupabase
            .from('checklists')
            .select('id')
            .eq('restaurant_id', restaurant_id)
            .in('id', incomingIds);

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }
        if (!existing || existing.length !== incomingIds.length) {
            return NextResponse.json(
                { error: 'Um ou mais checklists não pertencem a este restaurante.' },
                { status: 422 }
            );
        }

        // Atualizar order_index de cada checklist
        const results = await Promise.allSettled(
            checklist_orders.map(({ id, order_index }) =>
                adminSupabase
                    .from('checklists')
                    .update({ order_index })
                    .eq('id', id)
                    .eq('restaurant_id', restaurant_id)
            )
        );

        for (const result of results) {
            if (result.status === 'rejected') {
                return NextResponse.json({ error: String(result.reason) }, { status: 500 });
            }
            if (result.status === 'fulfilled' && result.value.error) {
                return NextResponse.json({ error: result.value.error.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
