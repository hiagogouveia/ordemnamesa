import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { emitDomainEvent } from '@/lib/notifications/emit';
import type { IssuePayload, IssueSeverity } from '@/lib/notifications/contract';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

interface IssueRow {
    id: string;
    restaurant_id: string;
    checklist_id: string;
    checklist_assumption_id: string | null;
    task_id: string;
    severity: string;
    reported_by: string;
    description: string;
}

/**
 * Monta o payload do evento a partir da ocorrência recém-criada.
 *
 * O `date_key` é o que destrava o deep-link histórico: sem ele, o painel só sabe
 * falar do "hoje" e uma ocorrência de ontem fica inalcançável. A fonte preferencial
 * é a assumption (o dia em que a rotina foi assumida). Sem assumption, cai no dia
 * corrente NO FUSO DO RESTAURANTE — nunca no fuso do servidor.
 */
async function buildIssuePayload(admin: SupabaseClient, issue: IssueRow): Promise<IssuePayload> {
    const [assumptionRes, checklistRes, taskRes, reporterRes] = await Promise.all([
        issue.checklist_assumption_id
            ? admin
                  .from('checklist_assumptions')
                  .select('date_key')
                  .eq('id', issue.checklist_assumption_id)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
        admin.from('checklists').select('name').eq('id', issue.checklist_id).maybeSingle(),
        admin.from('checklist_tasks').select('title').eq('id', issue.task_id).maybeSingle(),
        admin.from('users').select('name').eq('id', issue.reported_by).maybeSingle(),
    ]);

    let dateKey = (assumptionRes.data as { date_key?: string } | null)?.date_key;
    if (!dateKey) {
        const tz = await getRestaurantTimezone(admin, issue.restaurant_id);
        dateKey = getNowInTz(tz).dateKey;
    }

    const text = issue.description.trim();

    return {
        issue_id: issue.id,
        checklist_id: issue.checklist_id,
        checklist_assumption_id: issue.checklist_assumption_id,
        date_key: dateKey,
        task_id: issue.task_id,
        severity: (issue.severity === 'blocker' ? 'blocker' : 'normal') as IssueSeverity,
        reported_by_user_id: issue.reported_by,
        checklist_name: (checklistRes.data as { name?: string } | null)?.name ?? 'Rotina',
        task_title: (taskRes.data as { title?: string } | null)?.title ?? 'Tarefa',
        reported_by_name: (reporterRes.data as { name?: string } | null)?.name ?? 'Colaborador',
        excerpt: text.length > 120 ? `${text.slice(0, 120)}…` : text,
    };
}

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

        const { data: issue, error: insertError } = await admin
            .from('task_issues')
            .insert({
                restaurant_id,
                task_id,
                checklist_id,
                checklist_assumption_id: checklist_assumption_id ?? null,
                task_execution_id: task_execution_id ?? null,
                reported_by: user.id,
                description: description.trim(),
                photos: normalizedPhotos,
                status: 'open',
                severity: normalizedSeverity,
            })
            .select()
            .single();

        if (insertError) {
            console.error('[POST /api/task-issues] insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        const { error: eventError } = await admin
            .from('task_issue_events')
            .insert({
                task_issue_id: issue.id,
                restaurant_id,
                event_type: 'created',
                to_status: 'open',
                actor_user_id: user.id,
                metadata: { source: 'api' },
            });

        if (eventError) {
            console.error('[POST /api/task-issues] event insert error:', eventError);
        }

        // ── s90: a ocorrência passa a NOTIFICAR ──────────────────────────────
        //
        // Desde o s45 nenhuma ocorrência gerava notificação: o alerta que existia
        // (BLOCKED_ROUTINE) consultava task_executions.status='blocked', status que
        // aquela mesma migration removeu. O gestor ficou às cegas por meses.
        //
        // A rota só DECLARA o fato. Quem decide destinatário, prioridade e destino é
        // o materializador — em um só lugar. Não lança: reportar uma ocorrência não
        // pode falhar porque a notificação está fora do ar. Mas, ao contrário do
        // `catch` que engolia o erro, a falha agora fica registrada e é reprocessável.
        await emitDomainEvent(admin, 'IssueReported', {
            restaurantId: restaurant_id,
            actorUserId: user.id,
            payload: await buildIssuePayload(admin, issue as IssueRow),
        });

        return NextResponse.json({ issue }, { status: 201 });
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
