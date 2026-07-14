import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { trackEvent, type NotificationEventName } from '@/lib/analytics/track-event';
import { notificationLog } from '@/lib/notifications/log';

const ALLOWED = new Set<string>([
    'notification_clicked',
    'notification_navigation_succeeded',
    'notification_navigation_failed',
]);

/**
 * POST /api/notifications/telemetry
 *
 * Auditoria do ciclo de vida da navegação. Não existia rota de telemetria
 * client→server no projeto — `trackEvent` é server-only (usa SERVICE_ROLE_KEY).
 *
 * Tudo é correlacionado por `event_id` (o correlation id de ponta a ponta: 1 evento de
 * domínio → N notificações) + `notification_id`. Isso permite responder perguntas hoje
 * impossíveis: "este impedimento gerou quantas notificações? alguém clicou? a navegação
 * chegou ao destino?".
 *
 * A MÉTRICA que define o sucesso desta entrega é uma só:
 *
 *      navigation_failed / clicked  ≈  0   (exceto rotinas genuinamente excluídas)
 *
 * É a definição FALSIFICÁVEL de "deep-link determinístico". Se subir, o `reason` e o
 * `event_id` apontam a causa — em vez do "o gestor reclamou que caiu na tela errada".
 *
 * Best-effort: telemetria NUNCA pode quebrar a navegação. Erro aqui vira 204.
 */
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return new NextResponse(null, { status: 204 });

        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
        if (!user) return new NextResponse(null, { status: 204 });

        const body = await request.json();
        const { name, notification_id, event_id, type, reason, restaurant_id } = body ?? {};

        if (!ALLOWED.has(name)) return new NextResponse(null, { status: 204 });

        notificationLog.info({
            op: name === 'notification_clicked' ? 'click' : 'navigate',
            action: type,
            user_id: user.id,
            restaurant_id: restaurant_id ?? null,
            status: reason ?? name,
            msg: `event=${event_id ?? '-'} notif=${notification_id}`,
        });

        await trackEvent({
            eventName: name as NotificationEventName,
            category: 'engagement',
            userId: user.id,
            restaurantId: restaurant_id ?? null,
            metadata: { notification_id, event_id, type, reason },
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('[POST /api/notifications/telemetry] erro:', error);
        return new NextResponse(null, { status: 204 });
    }
}
