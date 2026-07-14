import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { detectDelayedRoutines } from '@/lib/notifications/detect-delayed';

/** Comparação em tempo constante; segura contra timing attacks e tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Detecta rotinas atrasadas e emite RoutineDelayed.
 *
 * Por que "atrasado" precisa de cron (e nenhum outro tipo precisa): é o único estado do
 * domínio que NÃO é um fato registrado. O banco nunca grava "isto atrasou às 14h03" — é
 * derivado, comparando o horário-limite da rotina com a hora atual. Não há INSERT nem
 * UPDATE para reagir; alguém precisa OLHAR o relógio.
 *
 * Rodar a cada 5 minutos é seguro porque a dedup_key inclui o dia
 * (`delayed:<checklist_id>:<date_key>`): o índice UNIQUE garante no máximo UMA
 * notificação por rotina/dia. Sem isso, cada varredura geraria um novo alerta.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (chamada por máquina, sem sessão).
 */
export async function POST(request: Request) {
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
            console.error('[cron/routines-delayed] CRON_SECRET não configurado');
            return NextResponse.json({ error: 'Rotina não configurada.' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');
        if (!token || !safeEqual(token, secret)) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const result = await detectDelayedRoutines();
        return NextResponse.json({ ok: true, ...result });
    } catch (error: unknown) {
        console.error('[cron/routines-delayed] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
