import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { applyPhotoRetention } from '@/lib/photos/retention';

/** Comparação em tempo constante; segura contra timing attacks e tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Rotina de retenção de fotos (superfície HTTP legada — o executor agora é o worker).
 *
 * A lógica vive em `lib/photos/retention.ts` (chamada tanto por esta rota quanto pelo
 * worker — uma fonte de verdade). Esta rota some na F6, quando o cron via HTTP for
 * removido; até lá, serve o disparo manual e o fallback.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>. Dry-run: ?dryRun=true.
 */
export async function POST(request: Request) {
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
            console.error('[cron/photo-retention] CRON_SECRET não configurado');
            return NextResponse.json({ error: 'Rotina não configurada.' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');
        if (!token || !safeEqual(token, secret)) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dryRun = searchParams.get('dryRun') === 'true';

        const result = await applyPhotoRetention({ dryRun });
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('[cron/photo-retention] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
