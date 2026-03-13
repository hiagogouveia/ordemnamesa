import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: checklistId } = await params;
        const body = await request.json();
        const { restaurant_id } = body;

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

        const userName = user.user_metadata?.name || user.email || 'Funcionário';
        const dateKey = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        // Upsert assumption with completion data
        const { data: existing } = await adminSupabase
            .from('checklist_assumptions')
            .select('id')
            .eq('checklist_id', checklistId)
            .eq('date_key', dateKey)
            .maybeSingle();

        let assumption;
        if (existing) {
            const { data, error } = await adminSupabase
                .from('checklist_assumptions')
                .update({
                    completed_at: now,
                    completed_by_user_id: user.id,
                    completed_by_user_name: userName,
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            assumption = data;
        } else {
            const { data, error } = await adminSupabase
                .from('checklist_assumptions')
                .insert({
                    restaurant_id,
                    checklist_id: checklistId,
                    user_id: user.id,
                    user_name: userName,
                    date_key: dateKey,
                    completed_at: now,
                    completed_by_user_id: user.id,
                    completed_by_user_name: userName,
                })
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            assumption = data;
        }

        return NextResponse.json({ assumption });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/[id]/complete] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
