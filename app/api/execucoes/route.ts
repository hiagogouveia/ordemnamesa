import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const dateStr = searchParams.get('date');

        if (!restaurant_id || !dateStr) {
            return NextResponse.json({ error: 'restaurant_id e date são obrigatórios' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Referencie Headers.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[GET /api/execucoes] User check failed:', userError);
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole) {
            return NextResponse.json({ error: 'Usuário não faz parte deste restaurante' }, { status: 403 });
        }

        // Filtra pelo dia atual, ignora hora.
        const startOfDay = new Date(dateStr);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(dateStr);
        endOfDay.setHours(23, 59, 59, 999);

        // Retornar as execuções do usuário no dia e restaurante. 
        // STAFF só vê o próprio histórico (para progress bar e home) ou de todos se role não for STAFF?
        // O escopo diz: "Retornar execuções do usuário no dia. Usado para calcular progresso do turno".

        const { data: execucoes, error } = await adminSupabase
            .from('task_executions')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .gte('executed_at', startOfDay.toISOString())
            .lte('executed_at', endOfDay.toISOString());

        if (error) {
            console.error('[GET /api/execucoes] Falha Fetch Execuções:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(execucoes || []);
    } catch (error: unknown) {
        console.error('[GET /api/execucoes] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

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
            console.error('[POST /api/execucoes] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { task_id, checklist_id, restaurant_id, status, notes, photo_url } = body;

        if (!task_id || !checklist_id || !restaurant_id || !status) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole) {
            return NextResponse.json({ error: 'Permissão negada no restaurante selecionado' }, { status: 403 });
        }

        // Verificação de duplicata: impede registrar a mesma task duas vezes no mesmo dia
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: existing } = await adminSupabase
            .from('task_executions')
            .select('id')
            .eq('task_id', task_id)
            .eq('user_id', user.id)
            .gte('executed_at', startOfDay.toISOString())
            .lte('executed_at', endOfDay.toISOString())
            .maybeSingle();

        if (existing) {
            return NextResponse.json(
                { error: 'Esta tarefa já foi registrada hoje.' },
                { status: 409 }
            );
        }

        // Criar o log
        const { data: newExecution, error: execError } = await adminSupabase
            .from('task_executions')
            .insert({
                restaurant_id,
                task_id,
                checklist_id,
                user_id: user.id,
                status,
                notes,
                photo_url,
                executed_at: new Date().toISOString()
            })
            .select()
            .single();

        if (execError) {
            console.error('[POST /api/execucoes] Erro ao criar execucao:', execError);
            return NextResponse.json({ error: execError.message }, { status: 500 });
        }

        return NextResponse.json(newExecution, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/execucoes] Erro Interno Desconhecido:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
