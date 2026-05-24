import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey, getBrazilNow } from '@/lib/utils/brazil-date';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * POST /api/receiving-expectations/mark-overdue
 *
 * Vassoura de overdue: marca como `overdue` toda expectativa do dia em status
 * pending|confirmed cujo `expected_window_end` já passou (hora atual em fuso
 * Brasil) e que NÃO tem assumption ligada. Por cada linha marcada, cria uma
 * notification do tipo RECEIVING_OVERDUE para cada owner/manager do restaurante.
 *
 * O alerta NÃO acusa o colaborador: "recebimento esperado não confirmado".
 *
 * Idempotente: a transição condicional via WHERE garante que rodar 2x não
 * gera notificações duplicadas (a 2ª execução não encontra mais nada para
 * marcar; a CHECK de status já está em overdue).
 *
 * Modos de invocação:
 *   - Body { restaurant_id }: owner/manager do restaurante (varredura sob demanda).
 *   - Sem body, com header x-cron-secret: futuro cron varre todos restaurantes
 *     (não implementado ainda — placeholder na validação).
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { restaurant_id } = body as { restaurant_id?: string };

        if (!restaurant_id) {
            return NextResponse.json(
                { error: 'restaurant_id é obrigatório (cron multi-tenant não implementado nesta fase)' },
                { status: 400 },
            );
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

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

        const brazil = getBrazilNow();
        const todayKey = getBrazilDateKey();
        const nowHHMMSS = brazil.timeHHMM + ':00'; // 'time' é HH:mm:ss em PG

        // CAS: marca overdue apenas o que ainda está pending/confirmed, sem assumption,
        // e cuja janela já passou. Retorna as linhas alteradas para gerar notifications.
        const { data: marked, error: markError } = await adminSupabase
            .from('receiving_expectations')
            .update({ status: 'overdue' })
            .eq('restaurant_id', restaurant_id)
            .eq('expected_date', todayKey)
            .in('status', ['pending', 'confirmed'])
            .is('assumption_id', null)
            .not('expected_window_end', 'is', null)
            .lt('expected_window_end', nowHHMMSS)
            .select('id, checklist_id, checklist:checklists(name, supplier_name)');

        if (markError) {
            console.error('[mark-overdue] update error:', markError);
            return NextResponse.json({ error: markError.message }, { status: 500 });
        }

        const markedRows = marked ?? [];
        if (markedRows.length === 0) {
            return NextResponse.json({ marked: 0, notified: 0 });
        }

        // Owner/manager do restaurante para enviar notification individual a cada.
        const { data: managers } = await adminSupabase
            .from('restaurant_users')
            .select('user_id')
            .eq('restaurant_id', restaurant_id)
            .in('role', ['owner', 'manager'])
            .eq('active', true);

        const managerIds = (managers ?? []).map((m) => m.user_id);

        if (managerIds.length === 0) {
            return NextResponse.json({ marked: markedRows.length, notified: 0 });
        }

        type MarkedRow = { id: string; checklist_id: string; checklist?: { name?: string | null; supplier_name?: string | null } | null };
        const notificationRows: Array<Record<string, unknown>> = [];
        for (const row of markedRows as unknown as MarkedRow[]) {
            const checklist = row.checklist ?? null;
            const supplier = checklist?.supplier_name || null;
            const checklistName = checklist?.name || 'Recebimento';
            const title = 'Recebimento esperado não confirmado';
            const description = supplier
                ? `${checklistName} — ${supplier}: ninguém confirmou a chegada dentro da janela esperada.`
                : `${checklistName}: ninguém confirmou a chegada dentro da janela esperada.`;
            for (const uid of managerIds) {
                notificationRows.push({
                    restaurant_id,
                    user_id: uid,
                    type: 'RECEIVING_OVERDUE',
                    title,
                    description,
                    related_id: row.id,
                    metadata: { expectation_id: row.id, checklist_id: row.checklist_id },
                });
            }
        }

        if (notificationRows.length > 0) {
            const { error: notifError } = await adminSupabase
                .from('notifications')
                .insert(notificationRows);
            if (notifError) {
                console.error('[mark-overdue] notifications insert error:', notifError);
                // Não invalida a marcação overdue — só perde a notificação.
            }
        }

        return NextResponse.json({ marked: markedRows.length, notified: notificationRows.length });
    } catch (err) {
        console.error('[mark-overdue] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
