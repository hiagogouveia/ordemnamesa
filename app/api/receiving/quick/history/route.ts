import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * GET /api/receiving/quick/history
 *
 * Superfície administrativa de "Recebimentos rápidos" (is_one_shot=true).
 * Lê checklists tipo receiving criados ad-hoc, junto com a assumption mais
 * recente do checklist (one-shot tem 1:1 com assumption, mas defensivamente
 * pegamos a mais recente). Fonte separada das expectations — quicks não
 * passam por materialização nem cron.
 *
 * Owner/manager bypassam filtro de área (admin context, alinhado com as
 * outras abas de /admin/recebimentos). Staff não acessa esta superfície.
 *
 * Query params:
 *   restaurant_id (obrigatório)
 *   days          (opcional, default 30, máximo 180) — janela temporal
 *   status        (opcional: 'all' | 'in_progress' | 'completed', default 'all')
 *
 * Retorna: lista ordenada por created_at desc.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const daysRaw = Number(searchParams.get('days') ?? '30');
        const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 180) : 30;

        const statusFilter = (searchParams.get('status') ?? 'all') as 'all' | 'in_progress' | 'completed';

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Acesso admin: owner/manager apenas. Staff não vê histórico de quicks
        // (acompanha apenas o que está executando no Meu Turno).
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();
        if (!membership) {
            return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });
        }
        if (membership.role !== 'owner' && membership.role !== 'manager') {
            return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
        }

        const sinceISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Lista os quicks da janela. Inclui active=false (já arquivados após
        // conclusão) — esta superfície existe justamente para enxergar
        // o que sumiu das listagens operacionais.
        const { data: checklists, error: clError } = await adminSupabase
            .from('checklists')
            .select(`
                id,
                name,
                supplier_name,
                area_id,
                active,
                is_one_shot,
                created_at,
                area:areas(id, name, color),
                tasks:checklist_tasks(id)
            `)
            .eq('restaurant_id', restaurant_id)
            .eq('checklist_type', 'receiving')
            .eq('is_one_shot', true)
            .gte('created_at', sinceISO)
            .order('created_at', { ascending: false });

        if (clError) {
            console.error('[GET /api/receiving/quick/history] erro ao listar checklists:', clError);
            return NextResponse.json({ error: clError.message }, { status: 500 });
        }

        const checklistIds = (checklists ?? []).map((c) => c.id);
        if (checklistIds.length === 0) {
            return NextResponse.json([]);
        }

        // Busca assumption associada (one-shot = 1 assumption no caminho feliz).
        // Carrega ordenado por assumed_at desc para pegar a mais recente em caso
        // de borda. Tambem busca task_executions para contar concluídas.
        const [assumptionsRes, executionsRes] = await Promise.all([
            adminSupabase
                .from('checklist_assumptions')
                .select('id, checklist_id, user_id, user_name, assumed_at, completed_at, execution_status')
                .eq('restaurant_id', restaurant_id)
                .in('checklist_id', checklistIds)
                .order('assumed_at', { ascending: false }),
            adminSupabase
                .from('task_executions')
                .select('checklist_id, status')
                .eq('restaurant_id', restaurant_id)
                .in('checklist_id', checklistIds),
        ]);

        // Mapa checklist_id → assumption (1ª = mais recente).
        type AssumptionRow = {
            id: string; checklist_id: string; user_id: string; user_name: string | null;
            assumed_at: string | null; completed_at: string | null; execution_status: string | null;
        };
        const assumptionByChecklist = new Map<string, AssumptionRow>();
        for (const a of ((assumptionsRes.data ?? []) as AssumptionRow[])) {
            if (!assumptionByChecklist.has(a.checklist_id)) {
                assumptionByChecklist.set(a.checklist_id, a);
            }
        }

        // Contagem de tarefas concluídas por checklist.
        const completedByChecklist = new Map<string, number>();
        for (const e of (executionsRes.data ?? []) as Array<{ checklist_id: string; status: string }>) {
            if (e.status === 'done') {
                completedByChecklist.set(e.checklist_id, (completedByChecklist.get(e.checklist_id) ?? 0) + 1);
            }
        }

        const rows = (checklists ?? []).map((c) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cl = c as any;
            const a = assumptionByChecklist.get(cl.id);
            return {
                checklist_id: cl.id as string,
                name: cl.name as string,
                supplier_name: (cl.supplier_name as string | null) ?? null,
                area_id: (cl.area_id as string | null) ?? null,
                area: cl.area ? {
                    id: cl.area.id as string,
                    name: cl.area.name as string,
                    color: cl.area.color as string,
                } : null,
                active: cl.active as boolean,
                is_one_shot: cl.is_one_shot as boolean,
                created_at: cl.created_at as string,
                assumed_at: a?.assumed_at ?? null,
                completed_at: a?.completed_at ?? null,
                assumed_by_user_id: a?.user_id ?? null,
                assumed_by_user_name: a?.user_name ?? null,
                tasks_total: Array.isArray(cl.tasks) ? cl.tasks.length : 0,
                tasks_completed: completedByChecklist.get(cl.id) ?? 0,
            };
        });

        // Filtro de status post-query (lista é curta — janela de até 180 dias).
        const filtered = rows.filter((r) => {
            if (statusFilter === 'in_progress') return r.completed_at === null;
            if (statusFilter === 'completed') return r.completed_at !== null;
            return true;
        });

        return NextResponse.json(filtered);
    } catch (err) {
        console.error('[GET /api/receiving/quick/history] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
