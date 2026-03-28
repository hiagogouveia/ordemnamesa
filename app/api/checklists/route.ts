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

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Referencie Headers.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[GET /api/checklists] User check failed:', userError);
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
            return NextResponse.json({ error: 'Permissões do restaurante não encontradas' }, { status: 403 });
        }

        let { data: checklists, error } = await adminSupabase
            .from('checklists')
            .select(`
                *,
                roles ( id, name, color ),
                tasks:checklist_tasks (*)
            `)
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .order('order_index', { ascending: true });

        if (error) {
            // Em caso de fallback (ex: coluna order_index inexistente)
            if (error.code === '42703' || error.message.includes('order_index')) {
                const fallbackFetch = await adminSupabase
                    .from('checklists')
                    .select(`
                        *,
                        roles ( id, name, color ),
                        tasks:checklist_tasks (*)
                    `)
                    .eq('restaurant_id', restaurant_id)
                    .eq('active', true)
                    .order('created_at', { ascending: false });

                if (fallbackFetch.error) {
                    console.error('[GET /api/checklists] Falha Fetch Fallback Checklists:', fallbackFetch.error);
                    return NextResponse.json({ error: fallbackFetch.error.message }, { status: 500 });
                }
                checklists = fallbackFetch.data;
            } else {
                console.error('[GET /api/checklists] Falha Fetch Checklists:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedChecklists = checklists?.map((checklist: any) => ({
            ...checklist,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tasks: checklist.tasks?.sort((a: any, b: any) => a.order - b.order) || []
        }));

        return NextResponse.json(formattedChecklists || []);
    } catch (error: unknown) {
        console.error('[GET /api/checklists] Erro inesperado:', error);
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
            console.error('[POST /api/checklists] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, description, shift, status, tasks, category, role_id, is_required, checklist_type, assigned_to_user_id, recurrence, start_time, end_time, recurrence_config, enforce_sequential_order, area_id, target_role } = body;

        if (!restaurant_id || !name || !shift) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
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
                role_id,
                is_required: is_required !== undefined ? is_required : true,
                checklist_type: checklist_type || 'regular',
                assigned_to_user_id: assigned_to_user_id || null,
                recurrence: recurrence || 'none',
                start_time: start_time || null,
                end_time: end_time || null,
                recurrence_config: recurrence_config || null,
                enforce_sequential_order: enforce_sequential_order !== undefined ? enforce_sequential_order : false,
                area_id: area_id || null,
                target_role: target_role || 'all',
                active: true,
                created_by: user.id
            })
            .select()
            .single();

        if (checklistError) {
            console.error('[POST /api/checklists] Erro ao criar checklist mestre:', checklistError);
            return NextResponse.json({ error: checklistError.message }, { status: 500 });
        }

        // 2. Inserir Tasks com Rollback
        let insertedTasks = [];
        if (tasks && tasks.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasksToInsert = tasks.map((task: any, index: number) => ({
                checklist_id: newChecklist.id,
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
                console.error('[POST /api/checklists] Erro nas tasks, realizando rollback:', tasksError);
                await adminSupabase.from('checklists').delete().eq('id', newChecklist.id);
                return NextResponse.json({ error: tasksError.message }, { status: 500 });
            }
            insertedTasks = newTasks.sort((a, b) => a.order - b.order);
        }

        return NextResponse.json({ ...newChecklist, tasks: insertedTasks }, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/checklists] Erro Interno Desconhecido:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
