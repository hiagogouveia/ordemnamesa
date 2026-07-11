import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { processAdminNotificationOutbox } from '@/lib/admin-notifications/process';

const BATCH_LIMIT = 100; // limite fixo por rodada: evita processamento infinito com fila grande

/** Comparação em tempo constante; segura contra timing attacks e tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Reprocessa o outbox de notificações administrativas: reenvia linhas pending/failed
 * elegíveis (attempts < max, next_attempt_at <= agora) com backoff. Garante entrega
 * mesmo se o Resend estiver indisponível no momento do submit do lead.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (chamada por máquina, sem sessão).
 * Roda a cada 5 min via GitHub Actions.
 */
export async function POST(request: Request) {
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
            console.error('[cron/admin-notifications] CRON_SECRET não configurado');
            return NextResponse.json({ error: 'Rotina não configurada.' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');
        if (!token || !safeEqual(token, secret)) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const result = await processAdminNotificationOutbox({ limit: BATCH_LIMIT });
        return NextResponse.json({ ok: true, ...result });
    } catch (error: unknown) {
        console.error('[cron/admin-notifications] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
