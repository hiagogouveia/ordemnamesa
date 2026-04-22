import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canExecuteTasks } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { id } = await context.params;
        const body = await request.json();
        const { restaurant_id, status, notes, photo_url } = body;

        if (!restaurant_id || !status) {
            return NextResponse.json({ error: 'Faltam campos obrigatórios' }, { status: 400 });
        }

        // Enforcement billing
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canExecuteTasks(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        const updateData: Record<string, unknown> = { status };
        if (notes !== undefined) updateData.notes = notes;
        if (photo_url !== undefined) updateData.photo_url = photo_url;
        if (status === 'done') updateData.executed_at = new Date().toISOString();

        const { data: updated, error: execError } = await adminSupabase
            .from('task_executions')
            .update(updateData)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id) // Only allow updating own executions
            .select()
            .single();

        if (execError) {
            console.error('Erro ao editar:', execError);
            return NextResponse.json({ error: execError.message }, { status: 500 });
        }

        return NextResponse.json(updated);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
