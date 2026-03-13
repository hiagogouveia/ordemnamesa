import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: userId } = await context.params;

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
        const { name, role, active, restaurant_id } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        // Verificar que o chamador é owner ou manager
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership || !['owner', 'manager'].includes(membership.role)) {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        // Impedir que owner/manager rebaixe a si mesmo
        if (userId === user.id && role !== undefined && role !== membership.role) {
            return NextResponse.json({ error: 'Você não pode alterar seu próprio cargo.' }, { status: 403 });
        }

        // Atualizar nome em public.users se fornecido
        if (name !== undefined) {
            const { error: nameError } = await adminSupabase
                .from('users')
                .update({ name: name.trim() })
                .eq('id', userId);

            if (nameError) {
                console.error('[PUT /api/equipe/[id]] name error:', nameError);
                return NextResponse.json({ error: nameError.message }, { status: 500 });
            }
        }

        // Atualizar role/active em restaurant_users se fornecido
        if (role !== undefined || active !== undefined) {
            const ruUpdates: Record<string, unknown> = {};
            if (role !== undefined) ruUpdates.role = role;
            if (active !== undefined) ruUpdates.active = active;

            const { error: ruError } = await adminSupabase
                .from('restaurant_users')
                .update(ruUpdates)
                .eq('user_id', userId)
                .eq('restaurant_id', restaurant_id);

            if (ruError) {
                console.error('[PUT /api/equipe/[id]] ru error:', ruError);
                return NextResponse.json({ error: ruError.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[PUT /api/equipe/[id]] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
