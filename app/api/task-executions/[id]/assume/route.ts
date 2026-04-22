import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canExecuteTasks } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

async function getUser(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return { user: null, error: 'Token ausente' };
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await getAdminSupabase().auth.getUser(token);
    return { user: error ? null : user, error: error?.message };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const { user, error: authErr } = await getUser(request);
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const adminSupabase = getAdminSupabase();

        // Enforcement billing
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canExecuteTasks(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        // 1. Buscar a task_execution para obter task_id
        const { data: execution, error: execErr } = await adminSupabase
            .from('task_executions')
            .select('id, task_id, status, user_id')
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .single();

        if (execErr || !execution) {
            return NextResponse.json({ error: 'Execução não encontrada' }, { status: 404 });
        }

        // 2. Buscar role_id da task
        const { data: task } = await adminSupabase
            .from('checklist_tasks')
            .select('role_id')
            .eq('id', execution.task_id)
            .single();

        // 3. Buscar max_concurrent_tasks da role do usuário (se a task tiver role_id)
        let maxConcurrent = 1;
        if (task?.role_id) {
            const { data: userRole } = await adminSupabase
                .from('user_roles')
                .select('role:roles(max_concurrent_tasks)')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .eq('role_id', task.role_id)
                .maybeSingle();

            if (userRole?.role) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                maxConcurrent = (userRole.role as any).max_concurrent_tasks ?? 1;
            }
        }

        // 4. Contar tarefas em andamento do usuário
        const { count, error: countErr } = await adminSupabase
            .from('task_executions')
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('status', 'doing');

        if (countErr) {
            console.error('[POST /api/task-executions/[id]/assume] Erro ao contar tarefas:', countErr);
            return NextResponse.json({ error: countErr.message }, { status: 500 });
        }

        const doingCount = count ?? 0;

        if (doingCount >= maxConcurrent) {
            return NextResponse.json(
                {
                    error: 'Limite atingido',
                    message: `Você já tem ${doingCount} tarefa${doingCount > 1 ? 's' : ''} em andamento.`,
                },
                { status: 409 }
            );
        }

        // 5. Assumir: UPDATE status='doing', started_at=now(), user_id=auth
        const { data, error: updateErr } = await adminSupabase
            .from('task_executions')
            .update({ status: 'doing', started_at: new Date().toISOString(), user_id: user.id })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .select()
            .single();

        if (updateErr) {
            console.error('[POST /api/task-executions/[id]/assume] Erro ao assumir tarefa:', updateErr);
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('[POST /api/task-executions/[id]/assume] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
