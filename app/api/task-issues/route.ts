import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { settleEmittedEvent } from '@/lib/notifications/emit';
import { DEDUP_KEYS, PAYLOAD_VERSION, type IssueSeverity } from '@/lib/notifications/contract';
import type { StoredDomainEvent } from '@/lib/notifications/materialize';
import { buildIssuePayload, type TaskIssueRow } from '@/lib/notifications/payloads';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

async function getAuthUser(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return { user: null, admin: null };
    const token = authHeader.replace('Bearer ', '');
    const admin = getAdminSupabase();
    const { data: { user } } = await admin.auth.getUser(token);
    return { user, admin };
}

async function assertMembership(admin: ReturnType<typeof getAdminSupabase>, restaurantId: string, userId: string) {
    const { data } = await admin
        .from('restaurant_users')
        .select('role')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();
    return data?.role as 'owner' | 'manager' | 'staff' | undefined;
}

// POST: cria ocorrência + evento 'created'
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            restaurant_id,
            task_id,
            checklist_id,
            checklist_assumption_id,
            task_execution_id,
            description,
            photos,
            severity,
        } = body ?? {};

        if (!restaurant_id || !task_id || !checklist_id) {
            return NextResponse.json({ error: 'restaurant_id, task_id e checklist_id são obrigatórios' }, { status: 400 });
        }
        if (typeof description !== 'string' || description.trim().length < 3) {
            return NextResponse.json({ error: 'description é obrigatório (mínimo 3 caracteres)' }, { status: 400 });
        }

        // s90: impedimento e ocorrência são a MESMA entidade — o que os separa é a
        // severidade. Default 'normal' preserva o comportamento de quem não envia o campo.
        const normalizedSeverity: IssueSeverity = severity === 'blocker' ? 'blocker' : 'normal';

        const { user, admin } = await getAuthUser(request);
        if (!user || !admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const role = await assertMembership(admin, restaurant_id, user.id);
        if (!role) return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });

        const normalizedPhotos = Array.isArray(photos)
            ? photos.filter((p): p is string => typeof p === 'string' && p.length > 0)
            : [];

        // ── OUTBOX TRANSACIONAL (s91, F7) ────────────────────────────────────
        //
        // A ocorrência, seu evento de auditoria e o domain_event (que vira notificação)
        // são gravados numa TRANSAÇÃO só, via report_task_issue_tx. Antes eram 3 escritas
        // separadas: um crash no meio deixava uma ocorrência sem notificação, sem retry.
        //
        // O id é gerado AQUI para que o payload — que referencia o issue_id — seja montado
        // antes da transação (buildIssuePayload só lê tabelas pré-existentes + os campos da
        // request). A rota só DECLARA o fato; destinatário/prioridade/destino são decididos
        // pelo materializador, num só lugar.
        const issueId = randomUUID();
        const issueRow: TaskIssueRow = {
            id: issueId,
            restaurant_id,
            checklist_id,
            checklist_assumption_id: checklist_assumption_id ?? null,
            task_id,
            severity: normalizedSeverity,
            reported_by: user.id,
            description: description.trim(),
        };
        const payload = await buildIssuePayload(admin, issueRow);
        const dedupKey = DEDUP_KEYS.IssueReported(payload);

        const { data: txData, error: txError } = await admin.rpc('report_task_issue_tx', {
            p_issue_id: issueId,
            p_restaurant_id: restaurant_id,
            p_task_id: task_id,
            p_checklist_id: checklist_id,
            p_checklist_assumption_id: checklist_assumption_id ?? null,
            p_task_execution_id: task_execution_id ?? null,
            p_reported_by: user.id,
            p_description: description.trim(),
            p_photos: normalizedPhotos,
            p_severity: normalizedSeverity,
            p_actor_user_id: user.id,
            p_event_type: 'IssueReported',
            p_dedup_key: dedupKey,
            p_payload: payload,
            p_payload_version: PAYLOAD_VERSION,
        });

        if (txError) {
            console.error('[POST /api/task-issues] tx error:', txError);
            return NextResponse.json({ error: txError.message }, { status: 500 });
        }

        const result = txData as { issue: unknown; domain_event: StoredDomainEvent | null };

        // Fast-path inline: materializa a notificação AGORA (fora da transação, best-effort).
        // Se falhar, o domain_event já está gravado (pending) e o worker reentrega — não lança.
        await settleEmittedEvent(admin, result.domain_event, {
            type: 'IssueReported',
            restaurantId: restaurant_id,
            dedupKey,
        });

        return NextResponse.json({ issue: result.issue }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/task-issues] error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

// GET: lista ocorrências por filtros
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const checklist_id = searchParams.get('checklist_id');
        const checklist_assumption_id = searchParams.get('checklist_assumption_id');
        const status = searchParams.get('status');
        const date_key = searchParams.get('date_key'); // se passado: filtra issues do dia
        const aggregate = searchParams.get('aggregate'); // 'counts_by_checklist'

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const { user, admin } = await getAuthUser(request);
        if (!user || !admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const role = await assertMembership(admin, restaurant_id, user.id);
        if (!role) return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });

        // Modo agregação: retorna {checklist_id, open_count} para badges
        if (aggregate === 'counts_by_checklist') {
            let query = admin
                .from('task_issues')
                .select('checklist_id, checklist_assumption_id, status')
                .eq('restaurant_id', restaurant_id)
                .in('status', ['open', 'investigating']);

            // Para counts diárias, filtrar pelas assumptions do dia
            if (date_key) {
                const { data: assumptionsToday } = await admin
                    .from('checklist_assumptions')
                    .select('id')
                    .eq('restaurant_id', restaurant_id)
                    .eq('date_key', date_key);
                const ids = (assumptionsToday ?? []).map(a => a.id);
                if (ids.length === 0) return NextResponse.json({ counts: {} });
                query = query.in('checklist_assumption_id', ids);
            }

            const { data: rows, error } = await query;
            if (error) {
                console.error('[GET /api/task-issues aggregate] error:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            const counts: Record<string, number> = {};
            for (const r of rows ?? []) {
                counts[r.checklist_id] = (counts[r.checklist_id] ?? 0) + 1;
            }
            return NextResponse.json({ counts });
        }

        // Listagem normal
        let query = admin
            .from('task_issues')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .order('created_at', { ascending: false });

        // Staff só vê próprias
        if (role === 'staff') {
            query = query.eq('reported_by', user.id);
        }
        if (checklist_id) query = query.eq('checklist_id', checklist_id);
        if (checklist_assumption_id) query = query.eq('checklist_assumption_id', checklist_assumption_id);
        if (status) query = query.eq('status', status);

        const { data: issues, error } = await query;
        if (error) {
            console.error('[GET /api/task-issues] error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ issues: issues ?? [] });
    } catch (error) {
        console.error('[GET /api/task-issues] error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
