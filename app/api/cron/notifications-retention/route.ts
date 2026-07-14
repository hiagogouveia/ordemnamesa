import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { applyNotificationRetention } from '@/lib/notifications/retention';

/** Comparação em tempo constante; segura contra timing attacks e tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Retenção da Central de Notificações. Diário.
 *
 * Lidas: 90 dias. Não lidas: 180 dias. Eventos processados: 90 dias.
 * Eventos FALHADOS são retidos — são evidência de bug, não lixo.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (chamada por máquina, sem sessão).
 */
export async function POST(request: Request) {
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
            console.error('[cron/notifications-retention] CRON_SECRET não configurado');
            return NextResponse.json({ error: 'Rotina não configurada.' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');
        if (!token || !safeEqual(token, secret)) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const result = await applyNotificationRetention();
        return NextResponse.json({ ok: true, ...result });
    } catch (error: unknown) {
        console.error('[cron/notifications-retention] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
