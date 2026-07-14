import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

/**
 * GET /api/notifications
 *
 * ── s90 ──────────────────────────────────────────────────────────────────────
 * Removido daqui o bloco que SINTETIZAVA alertas `BLOCKED_ROUTINE` a cada request.
 * Ele consultava `task_executions.status = 'blocked'` — status que o s45 removeu do
 * CHECK ao migrar impedimentos para `task_issues`. A query retornava sempre `[]`:
 * era dead code garantido, e por isso o sino ficou silencioso para ocorrências.
 *
 * Notificação agora é dado PERSISTIDO, nascido de um evento de domínio
 * (lib/notifications/emit.ts). Nada é inventado no momento da leitura — o que
 * também devolve a possibilidade de marcá-las como lidas (os alertas sintéticos
 * tinham id `alert_<uuid>`, inexistente no banco, e nunca podiam ser lidos).
 *
 * A ordenação segue a mesma ordem canônica do cliente (`lib/notifications/group.ts`):
 * não-lidas primeiro, depois prioridade, depois recência — coberta pelo índice
 * idx_notifications_user_rest_rank (s90).
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
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

        const [notificationsRes, unreadRes] = await Promise.all([
            adminSupabase
                .from('notifications')
                .select('id, restaurant_id, user_id, type, title, description, read, read_at, created_at, payload, priority, group_key, event_id, metadata, related_id')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .order('read', { ascending: true })
                .order('priority_rank', { ascending: true })
                .order('created_at', { ascending: false })
                .limit(limit),
            adminSupabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .eq('read', false),
        ]);

        if (notificationsRes.error) {
            return NextResponse.json({ error: notificationsRes.error.message }, { status: 500 });
        }

        return NextResponse.json({
            notifications: notificationsRes.data ?? [],
            unread_count: unreadRes.count ?? 0,
        });
    } catch (error: unknown) {
        console.error('[GET /api/notifications] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
