import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[PUT /api/checklists/[id]] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou Token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, description, shift, status, tasks, category, role_id, is_required, checklist_type, assigned_to_user_id, recurrence, start_time, end_time, recurrence_config } = body;

        if (!restaurant_id || !name) {
            return NextResponse.json({ error: 'restaurant_id e name são obrigatórios.' }, { status: 400 });
        }

        // Permissão
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes.' }, { status: 403 });
        }

        // 1. Atualizar Checklist
        const { error: updateError } = await adminSupabase
            .from('checklists')
            .update({
                name, description, shift, status, category,
                role_id, is_required: is_required !== undefined ? is_required : true, checklist_type: checklist_type || 'regular',
                assigned_to_user_id: assigned_to_user_id || null,
                recurrence: recurrence || 'none',
                start_time: start_time || null,
                end_time: end_time || null,
                recurrence_config: recurrence_config || null,
            })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (updateError) {
            console.error('[PUT /api/checklists/[id]] Erro no update do checklist:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // 2. Atualizar Tasks
        const { error: deleteTasksError } = await adminSupabase
            .from('checklist_tasks')
            .delete()
            .eq('checklist_id', id);

        if (deleteTasksError) {
            console.error('[PUT /api/checklists/[id]] Erro ao deletar tasks antigas:', deleteTasksError);
            return NextResponse.json({ error: deleteTasksError.message }, { status: 500 });
        }

        let insertedTasks = [];
        if (tasks && tasks.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasksToInsert = tasks.map((task: any, index: number) => ({
                checklist_id: id,
                restaurant_id,
                title: task.title,
                description: task.description,
                requires_photo: task.requires_photo || false,
                is_critical: task.is_critical || false,
                order: index,
                assigned_to_user_id: task.assigned_to_user_id || null
            }));

            const { data: newTasks, error: tasksError } = await adminSupabase
                .from('checklist_tasks')
                .insert(tasksToInsert)
                .select();

            if (tasksError) {
                console.error('[PUT /api/checklists/[id]] Erro ao recriar tasks:', tasksError);
                return NextResponse.json({ error: tasksError.message }, { status: 500 });
            }
            insertedTasks = newTasks.sort((a, b) => a.order - b.order);
        }

        return NextResponse.json({ success: true, tasks: insertedTasks });
    } catch (error: unknown) {
        console.error('[PUT /api/checklists/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) return NextResponse.json({ error: 'restaurant_id faltando' }, { status: 400 });

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[DELETE /api/checklists/[id]] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        // Permissão
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes' }, { status: 403 });
        }

        // Soft Delete
        const { error } = await adminSupabase
            .from('checklists')
            .update({ active: false })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (error) {
            console.error('[DELETE /api/checklists/[id]] Erro ao soft-delete:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/checklists/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
