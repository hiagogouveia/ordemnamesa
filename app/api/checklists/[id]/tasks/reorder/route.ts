import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

interface TaskOrderEntry {
    id: string;
    order: number;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: checklistId } = await context.params;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[PATCH /api/checklists/[id]/tasks/reorder] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, task_orders } = body as { restaurant_id: string; task_orders: TaskOrderEntry[] };

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }
        if (!Array.isArray(task_orders) || task_orders.length === 0) {
            return NextResponse.json({ error: 'task_orders deve ser um array não-vazio.' }, { status: 400 });
        }

        // Verificar permissão do usuário
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

        // Validação multi-tenant: confirmar que todos os task_ids pertencem a este checklist e restaurante
        const incomingIds = task_orders.map(t => t.id);

        const { data: existingTasks, error: fetchError } = await adminSupabase
            .from('checklist_tasks')
            .select('id')
            .eq('checklist_id', checklistId)
            .eq('restaurant_id', restaurant_id)
            .in('id', incomingIds);

        if (fetchError) {
            console.error('[PATCH /api/checklists/[id]/tasks/reorder] Erro ao validar tasks:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!existingTasks || existingTasks.length !== incomingIds.length) {
            return NextResponse.json(
                { error: 'Uma ou mais tarefas não pertencem a este checklist ou restaurante.' },
                { status: 422 }
            );
        }

        // Atualizar apenas o campo order de cada task (preserva IDs e referências em task_executions)
        const results = await Promise.allSettled(
            task_orders.map(({ id, order }) =>
                adminSupabase
                    .from('checklist_tasks')
                    .update({ order })
                    .eq('id', id)
                    .eq('checklist_id', checklistId)
                    .eq('restaurant_id', restaurant_id)
            )
        );

        const firstRejected = results.find(r => r.status === 'rejected');
        if (firstRejected) {
            const reason = firstRejected.status === 'rejected' ? firstRejected.reason : 'Erro desconhecido';
            console.error('[PATCH /api/checklists/[id]/tasks/reorder] Erro ao atualizar order:', reason);
            return NextResponse.json({ error: String(reason) }, { status: 500 });
        }

        // Verificar erros dentro dos resolved (Supabase retorna erro no objeto, não rejeita a Promise)
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.error) {
                console.error('[PATCH /api/checklists/[id]/tasks/reorder] Erro Supabase:', result.value.error);
                return NextResponse.json({ error: result.value.error.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[PATCH /api/checklists/[id]/tasks/reorder] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
