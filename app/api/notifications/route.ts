import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const limit = parseInt(searchParams.get('limit') || '20', 10);

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

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

        const { data: notifications, error } = await adminSupabase
            .from('notifications')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Contar não lidas
        const { count: unreadCount } = await adminSupabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('read', false);

        return NextResponse.json({
            notifications: notifications ?? [],
            unread_count: unreadCount ?? 0,
        });
    } catch (error: unknown) {
        console.error('[GET /api/notifications] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
