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
        const { status, manager_comment, description, photos, task_execution_id } = body ?? {};

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

        const { data: membership } = await admin
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', current.restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();

        if (!membership) {
            return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });
        }

        const isGestor = membership.role === 'owner' || membership.role === 'manager';
        const isAuthor = current.reported_by === user.id;

        // Detecta intenções:
        const wantsStatusOrComment = status !== undefined || typeof manager_comment === 'string';
        const wantsContentEdit = typeof description === 'string' || Array.isArray(photos);
        const wantsExecutionLink = typeof task_execution_id === 'string' && task_execution_id.length > 0;

        // Permissões:
        // - status / manager_comment → apenas gestor
        // - description / photos → apenas autor E status='open'
        if (wantsStatusOrComment && !isGestor) {
            return NextResponse.json({ error: 'Apenas gestor pode alterar status/comentário.' }, { status: 403 });
        }
        if (wantsContentEdit) {
            if (!isAuthor) {
                return NextResponse.json({ error: 'Apenas o autor pode editar descrição/fotos.' }, { status: 403 });
            }
            if (current.status !== 'open') {
                return NextResponse.json({ error: 'Edição permitida apenas enquanto a ocorrência está aberta.' }, { status: 409 });
            }
        }
        // Vínculo com execução (Sprint 46 — skip): autor pode amarrar enquanto issue está open;
        // gestor pode amarrar sempre. RLS direto bloquearia o autor, por isso passa por aqui.
        if (wantsExecutionLink) {
            const allowedAsAuthor = isAuthor && current.status === 'open';
            if (!isGestor && !allowedAsAuthor) {
                return NextResponse.json({ error: 'Sem permissão para vincular execução.' }, { status: 403 });
            }
        }
        if (!wantsStatusOrComment && !wantsContentEdit && !wantsExecutionLink) {
            return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
        }

        const fromStatus = current.status as IssueStatus;
        const toStatus: IssueStatus | undefined = status;
        const commentTrimmed = typeof manager_comment === 'string' ? manager_comment.trim() : undefined;
        const now = new Date().toISOString();

        const update: Record<string, unknown> = {};
        const events: Array<Record<string, unknown>> = [];

        // ── Trilha 1: gestor mudando status / comentário ───────────────────
        if (wantsStatusOrComment) {
            if (toStatus && toStatus !== fromStatus) {
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
                    events.push({
                        task_issue_id: id, restaurant_id: current.restaurant_id,
                        event_type: 'resolved', from_status: fromStatus, to_status: toStatus,
                        comment: commentTrimmed ?? null, actor_user_id: user.id,
                    });
                } else if (fromStatus === 'resolved') {
                    update.status = toStatus;
                    update.reopened_by = user.id;
                    update.reopened_at = now;
                    update.resolved_by = null;
                    update.resolved_at = null;
                    if (commentTrimmed) update.manager_comment = commentTrimmed;
                    events.push({
                        task_issue_id: id, restaurant_id: current.restaurant_id,
                        event_type: 'reopened', from_status: fromStatus, to_status: toStatus,
                        comment: commentTrimmed ?? null, actor_user_id: user.id,
                    });
                } else {
                    update.status = toStatus;
                    if (commentTrimmed) update.manager_comment = commentTrimmed;
                    events.push({
                        task_issue_id: id, restaurant_id: current.restaurant_id,
                        event_type: 'status_changed', from_status: fromStatus, to_status: toStatus,
                        comment: commentTrimmed ?? null, actor_user_id: user.id,
                    });
                }
            } else if (commentTrimmed && commentTrimmed.length > 0) {
                update.manager_comment = commentTrimmed;
                events.push({
                    task_issue_id: id, restaurant_id: current.restaurant_id,
                    event_type: 'comment_added', comment: commentTrimmed, actor_user_id: user.id,
                });
            }
        }

        // ── Trilha 3: amarrar/atualizar task_execution_id (skip flow) ──────
        if (wantsExecutionLink && task_execution_id !== current.task_execution_id) {
            update.task_execution_id = task_execution_id;
        }

        // ── Trilha 2: autor editando description / photos (somente open) ───
        if (wantsContentEdit) {
            const changes: Record<string, unknown> = {};
            if (typeof description === 'string') {
                const trimmed = description.trim();
                if (trimmed.length < 3) {
                    return NextResponse.json({ error: 'Descrição precisa ter ao menos 3 caracteres.' }, { status: 400 });
                }
                if (trimmed !== current.description) {
                    update.description = trimmed;
                    changes.description = { from: current.description, to: trimmed };
                }
            }
            if (Array.isArray(photos)) {
                const normalized = photos.filter((p): p is string => typeof p === 'string' && p.length > 0);
                const prev = Array.isArray(current.photos) ? current.photos : [];
                const sameLen = prev.length === normalized.length;
                const sameContent = sameLen && prev.every((p: string, i: number) => p === normalized[i]);
                if (!sameContent) {
                    update.photos = normalized;
                    changes.photos = { from_count: prev.length, to_count: normalized.length };
                }
            }
            if (Object.keys(changes).length > 0) {
                events.push({
                    task_issue_id: id, restaurant_id: current.restaurant_id,
                    event_type: 'edited', actor_user_id: user.id,
                    metadata: changes,
                });
            }
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
