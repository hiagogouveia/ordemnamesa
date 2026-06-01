import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Sprint 72 — Desfazer aplicação de Kit.
// Remove apenas rotinas recém-criadas SEM histórico (guarda na RPC).
// Valida auth + papel (owner/manager).

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id } = body;
        const checklistIds: string[] = Array.isArray(body.checklist_ids) ? body.checklist_ids : [];

        if (!restaurant_id || checklistIds.length === 0) {
            return NextResponse.json({ error: 'restaurant_id e checklist_ids são obrigatórios.' }, { status: 400 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
        }

        const { data, error } = await adminSupabase.rpc('undo_kit_application', {
            p_restaurant_id: restaurant_id,
            p_checklist_ids: checklistIds,
        });

        if (error) {
            console.error('[POST /api/checklist-kits/undo] RPC error:', error);
            return NextResponse.json({ error: 'Erro ao desfazer a aplicação.' }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('[POST /api/checklist-kits/undo] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
