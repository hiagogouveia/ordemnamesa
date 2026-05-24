import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { materializeReceivingForToday } from '@/lib/receiving/materialize';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * POST /api/receiving-expectations/materialize
 *
 * Materializa expectativas do dia atual (timezone Brasil) para o restaurante.
 * Idempotente: pode ser chamado N vezes sem duplicar (UNIQUE + ON CONFLICT).
 *
 * Permite invocação por owner/manager via body { restaurant_id }, ou por cron
 * futuro com service-role. Reusa o helper compartilhado materializeReceivingForToday.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { restaurant_id } = body as { restaurant_id?: string };
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!membership) {
            return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });
        }

        const result = await materializeReceivingForToday(adminSupabase, restaurant_id);
        return NextResponse.json(result);
    } catch (err) {
        console.error('[POST /api/receiving-expectations/materialize] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
