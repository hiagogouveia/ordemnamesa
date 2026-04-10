import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey, getBrazilStartAndEndOfDay } from '@/lib/utils/brazil-date';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const limit = parseInt(searchParams.get('limit') || '20', 10);

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

        // Buscar notificações reais e papel do usuário em paralelo
        const [notificationsRes, unreadRes, userRoleRes] = await Promise.all([
            adminSupabase
                .from('notifications')
                .select('*')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(limit),
            adminSupabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .eq('read', false),
            adminSupabase
                .from('restaurant_users')
                .select('role')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id)
                .eq('active', true)
                .single(),
        ]);

        if (notificationsRes.error) {
            return NextResponse.json({ error: notificationsRes.error.message }, { status: 500 });
        }

        // ── Alertas de bloqueio para owner/manager ────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let alertNotifications: any[] = [];
        const userRole = userRoleRes.data?.role;

        if (userRole === 'owner' || userRole === 'manager') {
            const todayKey = getBrazilDateKey();
            const { start: todayStartISO } = getBrazilStartAndEndOfDay();

            // 1. Buscar assumption_ids com tasks bloqueadas hoje
            const { data: blockedTasks } = await adminSupabase
                .from('task_executions')
                .select('checklist_assumption_id')
                .eq('restaurant_id', restaurant_id)
                .eq('status', 'blocked')
                .gte('executed_at', todayStartISO);

            const assumptionIds = [...new Set(
                (blockedTasks ?? [])
                    .filter((t: { checklist_assumption_id: string | null }) => t.checklist_assumption_id)
                    .map((t: { checklist_assumption_id: string }) => t.checklist_assumption_id)
            )];

            if (assumptionIds.length > 0) {
                // 2. Buscar detalhes das assumptions (excluindo as já concluídas)
                const { data: blockedAssumptions } = await adminSupabase
                    .from('checklist_assumptions')
                    .select('id, user_name, assumed_at, checklist_id')
                    .in('id', assumptionIds)
                    .eq('date_key', todayKey)
                    .is('completed_at', null);

                if (blockedAssumptions && blockedAssumptions.length > 0) {
                    const checklistIds = [...new Set(blockedAssumptions.map((a: { checklist_id: string }) => a.checklist_id))];

                    // 3. Buscar nome e área dos checklists
                    const { data: checklists } = await adminSupabase
                        .from('checklists')
                        .select('id, name, area:areas!area_id(name)')
                        .in('id', checklistIds);

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const checklistMap = new Map((checklists ?? []).map((c: any) => [c.id, c]));

                    alertNotifications = blockedAssumptions.map((a: { id: string; user_name: string | null; assumed_at: string; checklist_id: string }) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const cl = checklistMap.get(a.checklist_id) as any;
                        const areaName = cl?.area?.name;
                        const parts = [
                            areaName ? `Área: ${areaName}` : null,
                            a.user_name ? `Colaborador: ${a.user_name}` : null,
                            'Rotina com impedimento reportado',
                        ].filter(Boolean);

                        return {
                            id: `alert_${a.id}`,
                            restaurant_id,
                            user_id: user.id,
                            type: 'BLOCKED_ROUTINE',
                            title: cl?.name || 'Rotina com impedimento',
                            description: parts.join(' • '),
                            read: false,
                            created_at: a.assumed_at,
                            metadata: null,
                            related_id: null,
                        };
                    });
                }
            }
        }

        // Alertas de bloqueio aparecem primeiro (são críticos)
        const allNotifications = [...alertNotifications, ...(notificationsRes.data ?? [])];
        const unreadCount = (unreadRes.count ?? 0) + alertNotifications.length;

        return NextResponse.json({
            notifications: allNotifications,
            unread_count: unreadCount,
        });
    } catch (error: unknown) {
        console.error('[GET /api/notifications] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
