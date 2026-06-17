import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { PHOTO_RETENTION_DAYS } from '@/lib/config/photo-retention';

const STORAGE_BUCKET = 'photos';
const REMOVE_CHUNK = 100; // storage.remove em lotes para não estourar payload

function getAdminSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    );
}

/** Comparação em tempo constante; segura contra timing attacks e tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Rotina de retenção: remove fotos de evidência com mais de PHOTO_RETENTION_DAYS dias.
 * Apaga só os BYTES (arquivo + referências), preservando o registro de execução.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (chamada por máquina, sem sessão).
 * Dry-run: ?dryRun=true → só relata, não apaga nada.
 *
 * Ordem anti-órfão: zera refs no banco PRIMEIRO, depois remove os arquivos. Falha
 * parcial gera no máximo órfão (limpo na próxima rodada), nunca referência quebrada.
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

        const admin = getAdminSupabase();

        // 1) Paths expirados (por idade do arquivo).
        const { data: expired, error: listErr } = await admin.rpc('expired_evidence_photo_paths', {
            retention_days: PHOTO_RETENTION_DAYS,
        });
        if (listErr) {
            console.error('[cron/photo-retention] erro ao listar expirados:', listErr.message);
            return NextResponse.json({ error: listErr.message }, { status: 500 });
        }

        const paths: string[] = Array.isArray(expired)
            ? (expired as Array<string | { name?: string }>).map((p) =>
                typeof p === 'string' ? p : (p?.name ?? '')
            ).filter(Boolean)
            : [];

        if (dryRun) {
            return NextResponse.json({
                dryRun: true,
                retentionDays: PHOTO_RETENTION_DAYS,
                expiredCount: paths.length,
                sample: paths.slice(0, 10),
            });
        }

        if (paths.length === 0) {
            return NextResponse.json({ dryRun: false, retentionDays: PHOTO_RETENTION_DAYS, removed: 0, refs: null });
        }

        // 2) Zerar referências no banco (antes de apagar os arquivos).
        const { data: refsResult, error: purgeErr } = await admin.rpc('purge_evidence_photo_refs', {
            p_paths: paths,
        });
        if (purgeErr) {
            console.error('[cron/photo-retention] erro ao zerar referências:', purgeErr.message);
            return NextResponse.json({ error: purgeErr.message }, { status: 500 });
        }

        // 3) Remover arquivos do Storage em lotes.
        let removed = 0;
        const removeErrors: string[] = [];
        for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
            const chunk = paths.slice(i, i + REMOVE_CHUNK);
            const { error: rmErr } = await admin.storage.from(STORAGE_BUCKET).remove(chunk);
            if (rmErr) {
                removeErrors.push(rmErr.message);
                console.error('[cron/photo-retention] erro ao remover lote:', rmErr.message);
            } else {
                removed += chunk.length;
            }
        }

        return NextResponse.json({
            dryRun: false,
            retentionDays: PHOTO_RETENTION_DAYS,
            removed,
            refs: refsResult,
            removeErrors: removeErrors.length ? removeErrors : undefined,
        });
    } catch (error: unknown) {
        console.error('[cron/photo-retention] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
