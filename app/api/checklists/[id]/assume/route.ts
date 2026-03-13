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

        // Prefer name from users table, then user_metadata, then email
        const { data: userRecord } = await adminSupabase
            .from('users')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();
        const userName = userRecord?.name || user.user_metadata?.name || user.email || 'Funcionário';
        const dateKey = new Date().toISOString().split('T')[0];

        // Verificar se já existe assumption para hoje (por qualquer pessoa)
        const { data: existing } = await adminSupabase
            .from('checklist_assumptions')
            .select('*')
            .eq('checklist_id', checklistId)
            .eq('date_key', dateKey)
            .maybeSingle();

        if (existing) {
            // Já assumida — retornar a assumption existente sem erro
            return NextResponse.json({ assumption: existing, alreadyAssumed: true });
        }

        const { data: assumption, error: insertError } = await adminSupabase
            .from('checklist_assumptions')
            .insert({
                restaurant_id,
                checklist_id: checklistId,
                user_id: user.id,
                user_name: userName,
                date_key: dateKey,
            })
            .select()
            .single();

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({ assumption, alreadyAssumed: false });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/[id]/assume] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: checklistId } = await params;
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

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

        const dateKey = new Date().toISOString().split('T')[0];

        const { data: assumption } = await adminSupabase
            .from('checklist_assumptions')
            .select('*')
            .eq('checklist_id', checklistId)
            .eq('restaurant_id', restaurant_id)
            .eq('date_key', dateKey)
            .maybeSingle();

        return NextResponse.json({ assumption: assumption || null });
    } catch (error: unknown) {
        console.error('[GET /api/checklists/[id]/assume] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
