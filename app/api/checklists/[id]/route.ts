import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processRecurrencePayload } from '@/lib/api/recurrence-payload';

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
        const { restaurant_id, name, description, shift, status, tasks, category, role_id, is_required, checklist_type, assigned_to_user_id, recurrence, start_time, end_time, recurrence_config, enforce_sequential_order, area_id, target_role, assignment_type } = body;

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

        // 1. Buscar estado atual para proteger campos críticos contra remoção acidental
        const { data: currentChecklist } = await adminSupabase
            .from('checklists')
            .select('area_id, status')
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .single();

        // Proteção: area_id só é removido se explicitamente enviado como null no body
        // Se o campo não veio no payload (undefined), preserva o valor atual
        const safeAreaId = area_id !== undefined ? (area_id || null) : (currentChecklist?.area_id ?? null);

        if (!safeAreaId) {
            return NextResponse.json({ error: 'Selecione uma área para a rotina.' }, { status: 400 });
        }

        if (status === 'active') {
            let effectiveTasksCount = 0;
            if (Array.isArray(tasks)) {
                effectiveTasksCount = tasks.length;
            } else {
                const { count } = await adminSupabase
                    .from('checklist_tasks')
                    .select('id', { count: 'exact', head: true })
                    .eq('checklist_id', id);
                effectiveTasksCount = count ?? 0;
            }
            if (effectiveTasksCount === 0) {
                return NextResponse.json(
                    { error: 'Adicione ao menos uma tarefa para publicar a rotina.', code: 'NO_TASKS' },
                    { status: 400 }
                );
            }
        }

        // PR 2: roteamento estrito v2 vs v1 — payloads sem version=2 mantêm caminho legado
        const recurrenceProcess = processRecurrencePayload(recurrence_config);
        if (recurrenceProcess.mode === 'v2' && !recurrenceProcess.ok) {
            return NextResponse.json(
                { error: recurrenceProcess.error, code: 'INVALID_RECURRENCE_V2' },
                { status: 400 }
            );
        }

        // Validação legada de 'custom' — só roda quando NÃO é v2 (preserva v1 intacto)
        if (recurrenceProcess.mode === 'v1' && recurrence === 'custom') {
            const days = recurrence_config?.days_of_week;
            if (!Array.isArray(days) || days.length === 0) {
                return NextResponse.json(
                    { error: 'Recorrência personalizada exige ao menos um dia da semana selecionado.' },
                    { status: 400 }
                );
            }
        }

        // Validação de domínio: responsável deve pertencer à área selecionada
        const effectiveUserId = assigned_to_user_id || null;
        if (effectiveUserId && safeAreaId) {
            const { data: userArea } = await adminSupabase
                .from('user_areas')
                .select('id')
                .eq('user_id', effectiveUserId)
                .eq('area_id', safeAreaId)
                .maybeSingle();

            if (!userArea) {
                return NextResponse.json(
                    { error: 'O colaborador selecionado não pertence à área escolhida.' },
                    { status: 422 }
                );
            }
        }

        // PR 2: Em v2, a fonte de verdade é o JSONB validado — sincroniza coluna text
        // com `validated.type`. Em v1, usa o caminho legado intacto.
        const finalRecurrence =
            recurrenceProcess.mode === 'v2' && recurrenceProcess.ok
                ? recurrenceProcess.validated.type
                : (recurrence && recurrence !== 'none' ? recurrence : 'daily');
        const finalRecurrenceConfig =
            recurrenceProcess.mode === 'v2' && recurrenceProcess.ok
                ? recurrenceProcess.validated
                : (recurrence_config || null);

        // 1. Atualizar Checklist
        const { error: updateError } = await adminSupabase
            .from('checklists')
            .update({
                name, description, shift, status, category,
                role_id, is_required: is_required !== undefined ? is_required : true, checklist_type: checklist_type || 'regular',
                assigned_to_user_id: assigned_to_user_id || null,
                recurrence: finalRecurrence,
                start_time: start_time || null,
                end_time: end_time || null,
                recurrence_config: finalRecurrenceConfig,
                enforce_sequential_order: enforce_sequential_order !== undefined ? enforce_sequential_order : false,
                area_id: safeAreaId,
                target_role: target_role || 'all',
                assignment_type: assignment_type || (assigned_to_user_id ? 'user' : (area_id ? 'area' : 'all')),
            })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (updateError) {
            console.error('[PUT /api/checklists/[id]] Erro no update do checklist:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // 2. Atualizar Tasks
        // Pegar estado de tasks atuais
        const { data: existingTasks } = await adminSupabase
            .from('checklist_tasks')
            .select('id')
            .eq('checklist_id', id);

        const existingTaskIds = new Set(existingTasks?.map(t => t.id) || []);

        if (tasks && tasks.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasksToUpdate: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasksToInsert: any[] = [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tasks.forEach((task: any, index: number) => {
                const taskPayload = {
                    checklist_id: id,
                    restaurant_id,
                    title: task.title,
                    description: task.description,
                    requires_photo: task.requires_photo || false,
                    is_critical: task.is_critical || false,
                    order: index,
                    assigned_to_user_id: task.assigned_to_user_id || null
                };

                if (task.id && existingTaskIds.has(task.id)) {
                    tasksToUpdate.push({ ...taskPayload, id: task.id });
                    existingTaskIds.delete(task.id); // Marked as preserved
                } else {
                    tasksToInsert.push(taskPayload);
                }
            });

            // Update preservers
            for (const task of tasksToUpdate) {
                const { error: updateError } = await adminSupabase
                    .from('checklist_tasks')
                    .update(task)
                    .eq('id', task.id);
                if (updateError) {
                    console.error('[PUT /api/checklists/[id]] Erro update task:', updateError);
                }
            }

            // Insert new tasks
            if (tasksToInsert.length > 0) {
                const { error: insertError } = await adminSupabase
                    .from('checklist_tasks')
                    .insert(tasksToInsert);
                if (insertError) {
                    console.error('[PUT /api/checklists/[id]] Erro insert task:', insertError);
                }
            }
        }

        // Handle Removals gracefully (Opção B - Sem quebrar FK)
        const idsToRemove = Array.from(existingTaskIds);
        if (idsToRemove.length > 0) {
            // Verify if deleted tasks have prior executions
            const { data: executions } = await adminSupabase
                .from('task_executions')
                .select('task_id')
                .in('task_id', idsToRemove);
                
            const executedTaskIds = new Set(executions?.map(e => e.task_id) || []);
            const safeToDeleteIds = idsToRemove.filter(taskId => !executedTaskIds.has(taskId));
            
            if (safeToDeleteIds.length > 0) {
                const { error: deleteError } = await adminSupabase
                    .from('checklist_tasks')
                    .delete()
                    .in('id', safeToDeleteIds);
                if (deleteError) {
                    console.error('[PUT /api/checklists/[id]] Erro na deleção safe de tasks:', deleteError);
                }
            }
            // Tasks with execution histories (executedTaskIds) will inherently become orphaned from the checklist view order since the frontend doesn't render them anymore, but they stay in the DB for logs.
        }

        // 3. Buscar checklist completo atualizado
        const { data: fullChecklist, error: fetchFullError } = await adminSupabase
            .from('checklists')
            .select(`
                *,
                roles:role_id (id, name, color),
                tasks:checklist_tasks (*)
            `)
            .eq('id', id)
            .single();

        if (fetchFullError) {
            console.error('[PUT /api/checklists/[id]] Erro ao buscar checklist atualizado:', fetchFullError);
            return NextResponse.json({ error: fetchFullError.message }, { status: 500 });
        }

        return NextResponse.json(fullChecklist);
    } catch (error: unknown) {
        console.error('[PUT /api/checklists/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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
            console.error('[PATCH /api/checklists/[id]] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou Token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, active } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

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

        const updateData: Record<string, unknown> = {};
        if (active !== undefined) updateData.active = active;

        const { error: updateError } = await adminSupabase
            .from('checklists')
            .update(updateData)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (updateError) {
            console.error('[PATCH /api/checklists/[id]] Erro no update:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[PATCH /api/checklists/[id]] Erro Inesperado:', error);
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

        // Deletar task_executions antes (sem cascade automático)
        const { error: execError } = await adminSupabase
            .from('task_executions')
            .delete()
            .eq('checklist_id', id)
            .eq('restaurant_id', restaurant_id);

        if (execError) {
            console.error('[DELETE /api/checklists/[id]] Erro ao deletar task_executions:', execError);
            return NextResponse.json({ error: execError.message }, { status: 500 });
        }

        // Hard delete (cascata para tasks, assumptions e orders)
        const { error } = await adminSupabase
            .from('checklists')
            .delete()
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (error) {
            console.error('[DELETE /api/checklists/[id]] Erro ao deletar checklist:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/checklists/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
