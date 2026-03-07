import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await request.json();
        const { restaurant_id, task_id, checklist_id } = body;

        if (!restaurant_id || !task_id || !checklist_id) {
            return NextResponse.json({ error: 'Faltam campos obrigatórios' }, { status: 400 });
        }

        // Limit checks? For example, check if user has < max roles?
        // Let's assume the user can always assume if they want, or we could add check here.

        const { data: newExecution, error: execError } = await adminSupabase
            .from('task_executions')
            .insert({
                restaurant_id,
                task_id,
                checklist_id,
                user_id: user.id,
                status: 'doing',
                executed_at: new Date().toISOString()
            })
            .select()
            .single();

        if (execError) {
            console.error('Erro ao assumir:', execError);
            return NextResponse.json({ error: execError.message }, { status: 500 });
        }

        return NextResponse.json(newExecution, { status: 201 });
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
