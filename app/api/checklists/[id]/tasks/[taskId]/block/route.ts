import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';
import { verifyMembership } from '@/lib/api/auth';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; taskId: string }> }
) {
    try {
        const { id: checklistId, taskId } = await params;
        const body = await request.json();
        const { restaurant_id, reason } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }
        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return NextResponse.json({ error: 'reason é obrigatório' }, { status: 400 });
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

        // Isolamento multi-tenant: só membro ativo do restaurante (service-role bypassa RLS)
        const membership = await verifyMembership(adminSupabase, user.id, restaurant_id);
        if (membership instanceof NextResponse) return membership;

        // Buscar assumption ativa de hoje para este checklist
        const todayKey = getNowInTz(await getRestaurantTimezone(adminSupabase, restaurant_id)).dateKey;

        const { data: assumption } = await adminSupabase
            .from('checklist_assumptions')
            .select('id, completed_at')
            .eq('checklist_id', checklistId)
            .eq('restaurant_id', restaurant_id)
            .eq('date_key', todayKey)
            .maybeSingle();

        if (!assumption) {
            return NextResponse.json(
                { error: 'Nenhuma execução ativa encontrada para esta rotina hoje.' },
                { status: 404 }
            );
        }

        if (assumption.completed_at) {
            return NextResponse.json(
                { error: 'Esta rotina já foi finalizada.' },
                { status: 409 }
            );
        }

        // Verificar se a task pertence a este checklist
        const { data: task } = await adminSupabase
            .from('checklist_tasks')
            .select('id')
            .eq('id', taskId)
            .eq('checklist_id', checklistId)
            .eq('restaurant_id', restaurant_id)
            .maybeSingle();

        if (!task) {
            return NextResponse.json({ error: 'Tarefa não encontrada nesta rotina.' }, { status: 404 });
        }

        // UPSERT: verificar se já existe execução para esta task nesta assumption
        const { data: existingExecution } = await adminSupabase
            .from('task_executions')
            .select('id, status')
            .eq('task_id', taskId)
            .eq('checklist_id', checklistId)
            .eq('checklist_assumption_id', assumption.id)
            .maybeSingle();

        const now = new Date().toISOString();

        if (existingExecution) {
            // Atualizar execução existente para blocked
            const { data: updated, error: updateError } = await adminSupabase
                .from('task_executions')
                .update({
                    status: 'blocked',
                    blocked_reason: reason.trim(),
                    blocked_at: now,
                    blocked_by_user_id: user.id,
                })
                .eq('id', existingExecution.id)
                .select()
                .single();

            if (updateError) {
                console.error('[POST block] Erro ao atualizar execução:', updateError);
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }

            return NextResponse.json({ execution: updated });
        } else {
            // Sprint 84 — snapshot da identidade da tarefa (fidelidade histórica da Auditoria)
            const { data: taskDef } = await adminSupabase
                .from('checklist_tasks')
                .select('title, description, is_critical')
                .eq('id', taskId)
                .maybeSingle();

            // Criar nova execução com status blocked
            const { data: created, error: insertError } = await adminSupabase
                .from('task_executions')
                .insert({
                    restaurant_id,
                    task_id: taskId,
                    checklist_id: checklistId,
                    checklist_assumption_id: assumption.id,
                    user_id: user.id,
                    status: 'blocked',
                    blocked_reason: reason.trim(),
                    blocked_at: now,
                    blocked_by_user_id: user.id,
                    executed_at: now,
                    task_title_snapshot: taskDef?.title ?? null,
                    task_description_snapshot: taskDef?.description ?? null,
                    is_critical_snapshot: taskDef?.is_critical ?? null,
                })
                .select()
                .single();

            if (insertError) {
                console.error('[POST block] Erro ao criar execução:', insertError);
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }

            return NextResponse.json({ execution: created }, { status: 201 });
        }
    } catch (error: unknown) {
        console.error('[POST /api/checklists/[id]/tasks/[taskId]/block] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
