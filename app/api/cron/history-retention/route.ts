import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { applyHistoryRetention } from '@/lib/photos/retention';

function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Rotina de retenção de HISTÓRICO (superfície HTTP legada — o executor agora é o worker).
 *
 * DELEÇÃO IRREVERSÍVEL. A lógica vive em `lib/photos/retention.ts` (uma fonte de verdade,
 * compartilhada com o worker). Esta rota some na F6.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>. Dry-run: ?dryRun=true (só conta, não apaga).
 */
export async function POST(request: Request) {
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
            console.error('[cron/history-retention] CRON_SECRET não configurado');
            return NextResponse.json({ error: 'Rotina não configurada.' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');
        if (!token || !safeEqual(token, secret)) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dryRun = searchParams.get('dryRun') === 'true';

        const result = await applyHistoryRetention({ dryRun });
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('[cron/history-retention] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
