import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey } from '@/lib/utils/brazil-date';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * GET /api/receiving-expectations/counts?restaurant_id=&date=
 *
 * Contadores por status para o inbox do gestor (owner/manager). Uma query única,
 * agregada em memória. Date default = hoje (Brasil).
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }
        const date = searchParams.get('date') || getBrazilDateKey();

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
        if (!membership || (membership.role !== 'owner' && membership.role !== 'manager')) {
            return NextResponse.json({ error: 'Permissões insuficientes' }, { status: 403 });
        }

        const { data, error } = await adminSupabase
            .from('receiving_expectations')
            .select('status')
            .eq('restaurant_id', restaurant_id)
            .eq('expected_date', date);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const counts = { pending: 0, overdue: 0, confirmed: 0, cancelled: 0 };
        for (const r of data ?? []) {
            const s = r.status as keyof typeof counts;
            if (s in counts) counts[s] += 1;
        }
        return NextResponse.json(counts);
    } catch (err) {
        console.error('[GET /api/receiving-expectations/counts] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
