import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

const getAuthSupabase = async () => {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll() { }
            },
        }
    );
};

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params; // Corrected params extraction

        const authSupabase = await getAuthSupabase();
        const { data: { user } } = await authSupabase.auth.getUser();

        if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await request.json();
        const { restaurant_id, name, description, shift, status, tasks } = body;

        if (!restaurant_id) return NextResponse.json({ error: 'restaurant_id faltando' }, { status: 400 });

        const adminSupabase = getAdminSupabase();

        // Permissão
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

        // 1. Atualizar Checklist
        const { error: updateError } = await adminSupabase
            .from('checklists')
            .update({ name, description, shift, status })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (updateError) throw updateError;

        // 2. Atualizar Tasks (Deletar as que saíram e Inserir as novas/atualizadas)
        // O Supabase tem um recurso de upsert, mas como podemos deletar tasks, o fluxo mais simples
        // na API é apagar as atuais do checklist e inserir as novas com a nova ordem.

        const { error: deleteTasksError } = await adminSupabase
            .from('checklist_tasks')
            .delete()
            .eq('checklist_id', id);

        if (deleteTasksError) throw deleteTasksError;

        let insertedTasks = [];
        if (tasks && tasks.length > 0) {
            const tasksToInsert = tasks.map((task: { title: string; description?: string; requires_photo?: boolean; is_critical?: boolean }, index: number) => ({
                checklist_id: id,
                restaurant_id,
                title: task.title,
                description: task.description,
                requires_photo: task.requires_photo || false,
                is_critical: task.is_critical || false,
                order: index
            }));

            const { data: newTasks, error: tasksError } = await adminSupabase
                .from('checklist_tasks')
                .insert(tasksToInsert)
                .select();

            if (tasksError) throw tasksError;
            insertedTasks = newTasks.sort((a, b) => a.order - b.order);
        }

        return NextResponse.json({ success: true, tasks: insertedTasks });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params; // Corrected params extraction
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) return NextResponse.json({ error: 'restaurant_id faltando' }, { status: 400 });

        const authSupabase = await getAuthSupabase();
        const { data: { user } } = await authSupabase.auth.getUser();

        if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const adminSupabase = getAdminSupabase();

        // Permissão
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

        // Soft Delete
        const { error } = await adminSupabase
            .from('checklists')
            .update({ active: false })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
