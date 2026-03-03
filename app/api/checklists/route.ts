import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente admin com SERVICE_ROLE para ignorar RLS e podermos focar no backend validation
const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

// Cliente auth para pegar o usuário da requisição real
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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authSupabase = await getAuthSupabase();
        const { data: { user } } = await authSupabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const adminSupabase = getAdminSupabase();

        // Verifica se o usuário tem permissão de MANAGER ou OWNER neste restaurante
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

        // Buscar checklists com tasks
        const { data: checklists, error } = await adminSupabase
            .from('checklists')
            .select(`
                *,
                tasks:checklist_tasks(*)
            `)
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Ordenar as tasks por "order"
        const formattedChecklists = checklists?.map(checklist => ({
            ...checklist,
            tasks: checklist.tasks?.sort((a: { order: number }, b: { order: number }) => a.order - b.order) || []
        }));

        return NextResponse.json(formattedChecklists || []);
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const authSupabase = await getAuthSupabase();
        const { data: { user } } = await authSupabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, description, shift, status, tasks, category } = body;

        if (!restaurant_id || !name || !shift) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        const adminSupabase = getAdminSupabase();

        // Validação de permissão
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

        // 1. Criar o Checklist
        const { data: newChecklist, error: checklistError } = await adminSupabase
            .from('checklists')
            .insert({
                restaurant_id,
                name,
                description,
                shift,
                category,
                status,
                active: true,
                created_by: user.id
            })
            .select()
            .single();

        if (checklistError) throw checklistError;

        // 2. Inserir Tasks se existirem
        let insertedTasks = [];
        if (tasks && tasks.length > 0) {
            const tasksToInsert = tasks.map((task: { title: string; description?: string; requires_photo?: boolean; is_critical?: boolean }, index: number) => ({
                checklist_id: newChecklist.id,
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

        return NextResponse.json({ ...newChecklist, tasks: insertedTasks }, { status: 201 });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
