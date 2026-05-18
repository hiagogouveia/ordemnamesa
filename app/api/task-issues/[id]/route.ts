import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

type IssueStatus = 'open' | 'investigating' | 'resolved';
const VALID_STATUSES: IssueStatus[] = ['open', 'investigating', 'resolved'];

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { status, manager_comment } = body ?? {};

        if (status !== undefined && !VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: 'status inválido' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const admin = getAdminSupabase();

        const { data: { user } } = await admin.auth.getUser(token);
        if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { data: current, error: loadError } = await admin
            .from('task_issues')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (loadError || !current) {
            return NextResponse.json({ error: 'Ocorrência não encontrada' }, { status: 404 });
        }

        // Check role: somente owner/manager pode mexer
        const { data: membership } = await admin
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', current.restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();

        if (!membership || (membership.role !== 'owner' && membership.role !== 'manager')) {
            return NextResponse.json({ error: 'Sem permissão para alterar ocorrência' }, { status: 403 });
        }

        const fromStatus = current.status as IssueStatus;
        const toStatus: IssueStatus | undefined = status;
        const commentTrimmed = typeof manager_comment === 'string' ? manager_comment.trim() : undefined;
        const now = new Date().toISOString();

        const update: Record<string, unknown> = {};

        // Aplica novo status (se mudou)
        if (toStatus && toStatus !== fromStatus) {
            // Validação: resolver exige comentário non-empty (current ou novo)
            if (toStatus === 'resolved') {
                const effectiveComment = commentTrimmed ?? current.manager_comment ?? '';
                if (!effectiveComment || effectiveComment.length === 0) {
                    return NextResponse.json(
                        { error: 'É obrigatório adicionar um comentário ao resolver a ocorrência.' },
                        { status: 400 }
                    );
                }
                update.status = 'resolved';
                update.resolved_by = user.id;
                update.resolved_at = now;
                if (commentTrimmed) update.manager_comment = commentTrimmed;
            } else if (fromStatus === 'resolved') {
                // Reabertura
                update.status = toStatus;
                update.reopened_by = user.id;
                update.reopened_at = now;
                update.resolved_by = null;
                update.resolved_at = null;
                if (commentTrimmed) update.manager_comment = commentTrimmed;
            } else {
                update.status = toStatus;
                if (commentTrimmed) update.manager_comment = commentTrimmed;
            }
        } else if (commentTrimmed !== undefined && commentTrimmed.length > 0) {
            // Apenas comentário
            update.manager_comment = commentTrimmed;
        }

        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
        }

        const { data: updated, error: updateError } = await admin
            .from('task_issues')
            .update(update)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('[PATCH /api/task-issues/[id]] update error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Registrar evento(s) apropriado(s)
        const events: Array<Record<string, unknown>> = [];
        if (toStatus && toStatus !== fromStatus) {
            if (toStatus === 'resolved') {
                events.push({
                    task_issue_id: id,
                    restaurant_id: current.restaurant_id,
                    event_type: 'resolved',
                    from_status: fromStatus,
                    to_status: toStatus,
                    comment: commentTrimmed ?? null,
                    actor_user_id: user.id,
                });
            } else if (fromStatus === 'resolved') {
                events.push({
                    task_issue_id: id,
                    restaurant_id: current.restaurant_id,
                    event_type: 'reopened',
                    from_status: fromStatus,
                    to_status: toStatus,
                    comment: commentTrimmed ?? null,
                    actor_user_id: user.id,
                });
            } else {
                events.push({
                    task_issue_id: id,
                    restaurant_id: current.restaurant_id,
                    event_type: 'status_changed',
                    from_status: fromStatus,
                    to_status: toStatus,
                    comment: commentTrimmed ?? null,
                    actor_user_id: user.id,
                });
            }
        } else if (commentTrimmed && commentTrimmed.length > 0) {
            events.push({
                task_issue_id: id,
                restaurant_id: current.restaurant_id,
                event_type: 'comment_added',
                comment: commentTrimmed,
                actor_user_id: user.id,
            });
        }

        if (events.length > 0) {
            const { error: eventError } = await admin.from('task_issue_events').insert(events);
            if (eventError) {
                console.error('[PATCH /api/task-issues/[id]] event insert error:', eventError);
            }
        }

        return NextResponse.json({ issue: updated });
    } catch (error) {
        console.error('[PATCH /api/task-issues/[id]] error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
