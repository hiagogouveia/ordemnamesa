import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

// Marcar notificação(ões) como lida(s)
export async function PATCH(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { notification_id, mark_all, restaurant_id } = body;

        if (mark_all && restaurant_id) {
            // Marcar todas como lidas
            const { error } = await adminSupabase
                .from('notifications')
                .update({ read: true })
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .eq('read', false);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        if (notification_id) {
            const { error } = await adminSupabase
                .from('notifications')
                .update({ read: true })
                .eq('id', notification_id)
                .eq('user_id', user.id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'notification_id ou mark_all é obrigatório' }, { status: 400 });
    } catch (error: unknown) {
        console.error('[PATCH /api/notifications/read] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
