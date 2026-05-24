import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey, getBrazilNow } from '@/lib/utils/brazil-date';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

type MarkedRow = {
    id: string;
    checklist_id: string;
    restaurant_id: string;
    checklist?: { name?: string | null; supplier_name?: string | null } | null;
};

/**
 * Vassoura de overdue para um ou todos os restaurantes. Idempotente.
 * Reusa a mesma transição CAS (WHERE status IN ('pending','confirmed') ...).
 */
async function sweepOverdue(
    adminSupabase: ReturnType<typeof getAdminSupabase>,
    restaurantId?: string,
): Promise<{ marked: number; notified: number }> {
    const brazil = getBrazilNow();
    const todayKey = getBrazilDateKey();
    const nowHHMMSS = brazil.timeHHMM + ':00';

    let updateQuery = adminSupabase
        .from('receiving_expectations')
        .update({ status: 'overdue' })
        .eq('expected_date', todayKey)
        .in('status', ['pending', 'confirmed'])
        .is('assumption_id', null)
        .not('expected_window_end', 'is', null)
        .lt('expected_window_end', nowHHMMSS);
    if (restaurantId) updateQuery = updateQuery.eq('restaurant_id', restaurantId);

    const { data: marked, error: markError } = await updateQuery
        .select('id, checklist_id, restaurant_id, checklist:checklists(name, supplier_name)');

    if (markError) throw markError;
    const markedRows = (marked ?? []) as unknown as MarkedRow[];
    if (markedRows.length === 0) return { marked: 0, notified: 0 };

    // Agrupa por restaurante para evitar N+1 ao buscar managers.
    const byRestaurant = new Map<string, MarkedRow[]>();
    for (const row of markedRows) {
        const arr = byRestaurant.get(row.restaurant_id) ?? [];
        arr.push(row);
        byRestaurant.set(row.restaurant_id, arr);
    }

    const restaurantIds = Array.from(byRestaurant.keys());
    const { data: managers } = await adminSupabase
        .from('restaurant_users')
        .select('restaurant_id, user_id')
        .in('restaurant_id', restaurantIds)
        .in('role', ['owner', 'manager'])
        .eq('active', true);

    const managersByRestaurant = new Map<string, string[]>();
    for (const m of managers ?? []) {
        const arr = managersByRestaurant.get(m.restaurant_id) ?? [];
        arr.push(m.user_id);
        managersByRestaurant.set(m.restaurant_id, arr);
    }

    const notificationRows: Array<Record<string, unknown>> = [];
    for (const [rId, rows] of byRestaurant) {
        const managerIds = managersByRestaurant.get(rId) ?? [];
        if (managerIds.length === 0) continue;
        for (const row of rows) {
            const checklist = row.checklist ?? null;
            const supplier = checklist?.supplier_name || null;
            const checklistName = checklist?.name || 'Recebimento';
            const title = 'Recebimento esperado não confirmado';
            const description = supplier
                ? `${checklistName} — ${supplier}: ninguém confirmou a chegada dentro da janela esperada.`
                : `${checklistName}: ninguém confirmou a chegada dentro da janela esperada.`;
            for (const uid of managerIds) {
                notificationRows.push({
                    restaurant_id: rId,
                    user_id: uid,
                    type: 'RECEIVING_OVERDUE',
                    title,
                    description,
                    related_id: row.id,
                    metadata: { expectation_id: row.id, checklist_id: row.checklist_id },
                });
            }
        }
    }

    if (notificationRows.length > 0) {
        const { error: notifError } = await adminSupabase
            .from('notifications')
            .insert(notificationRows);
        if (notifError) console.error('[mark-overdue] notifications insert error:', notifError);
    }

    return { marked: markedRows.length, notified: notificationRows.length };
}

/**
 * POST /api/receiving-expectations/mark-overdue
 *
 * Modos de invocação:
 *   1) Usuário owner/manager (Bearer token) + body { restaurant_id }
 *      → varre apenas o restaurante (uso do inbox admin).
 *   2) Cron (header x-cron-secret = env RECEIVING_CRON_SECRET)
 *      → varre TODOS os restaurantes ativos do dia em uma única query.
 *
 * Idempotente em ambos os modos (CAS no status atual). Mensagem nunca acusa
 * o colaborador — "recebimento esperado não confirmado".
 */
export async function POST(request: Request) {
    try {
        const adminSupabase = getAdminSupabase();
        const cronSecret = request.headers.get('x-cron-secret');
        const expectedSecret = process.env.RECEIVING_CRON_SECRET;

        // Modo cron (multi-tenant sweep)
        if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
            const result = await sweepOverdue(adminSupabase);
            return NextResponse.json({ mode: 'cron', ...result });
        }

        // Modo usuário (single-tenant)
        const body = await request.json().catch(() => ({}));
        const { restaurant_id } = body as { restaurant_id?: string };
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!membership) return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });

        const result = await sweepOverdue(adminSupabase, restaurant_id);
        return NextResponse.json({ mode: 'user', ...result });
    } catch (err) {
        console.error('[mark-overdue] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
