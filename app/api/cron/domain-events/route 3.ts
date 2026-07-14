import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { processDomainEventsOutbox } from '@/lib/notifications/process';

const BATCH_LIMIT = 100; // limite fixo por rodada: evita processamento infinito com fila grande

/** Comparação em tempo constante; segura contra timing attacks e tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Reprocessa o outbox de eventos de domínio: materializa as notificações dos eventos
 * que ficaram `pending` porque a materialização inline falhou (banco instável, deploy
 * no meio, bug). Backoff exponencial; `failed` é terminal e não é repescado.
 *
 * É a rede de segurança que substitui o `catch` que engolia o erro: antes, uma falha
 * na notificação a fazia sumir sem rastro. Agora ela é reentregue.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (chamada por máquina, sem sessão).
 * Roda a cada 5 min via GitHub Actions.
 */
export async function POST(request: Request) {
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
            console.error('[cron/domain-events] CRON_SECRET não configurado');
            return NextResponse.json({ error: 'Rotina não configurada.' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');
        if (!token || !safeEqual(token, secret)) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const result = await processDomainEventsOutbox({ limit: BATCH_LIMIT });
        return NextResponse.json({ ok: true, ...result });
    } catch (error: unknown) {
        console.error('[cron/domain-events] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
