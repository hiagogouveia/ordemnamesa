import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { HISTORY_RETENTION_DAYS } from '@/lib/config/photo-retention';

const STORAGE_BUCKET = 'photos';
const REMOVE_CHUNK = 100;

function getAdminSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    );
}

function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * Rotina de retenção de HISTÓRICO: remove o histórico de execução com mais de
 * HISTORY_RETENTION_DAYS dias — task_executions, checklist_assumptions, task_issues
 * (+ task_issue_events por cascade). De TODOS os tipos (inclusive recebimento).
 *
 * NUNCA remove definições de rotina (checklists/checklist_tasks) nem o recebimento em si
 * (receiving_expectations) — apenas o histórico além do período. Nada com < N dias é tocado.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>.
 * Dry-run: ?dryRun=true → só conta o que seria apagado, não apaga nada.
 *
 * A função SQL `purge_expired_history` faz a deleção (na ordem segura) e retorna os paths das
 * fotos das linhas apagadas; aqui removemos esses arquivos do Storage.
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

        const admin = getAdminSupabase();

        if (dryRun) {
            const { data, error } = await admin.rpc('purge_expired_history', {
                retention_days: HISTORY_RETENTION_DAYS,
                dry_run: true,
            });
            if (error) {
                console.error('[cron/history-retention] erro no dry-run:', error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json({ dryRun: true, retentionDays: HISTORY_RETENTION_DAYS, ...data });
        }

        // Execução real: a função seta o opt-in dos triggers e apaga na ordem segura.
        const { data, error } = await admin.rpc('purge_expired_history', {
            retention_days: HISTORY_RETENTION_DAYS,
            dry_run: false,
        });
        if (error) {
            console.error('[cron/history-retention] erro ao expurgar histórico:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Remove do Storage as fotos das linhas apagadas (em lotes).
        const paths: string[] = Array.isArray((data as { photo_paths?: unknown })?.photo_paths)
            ? ((data as { photo_paths: unknown[] }).photo_paths.filter(
                (p): p is string => typeof p === 'string' && p.length > 0
            ))
            : [];
        let removed = 0;
        const removeErrors: string[] = [];
        for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
            const chunk = paths.slice(i, i + REMOVE_CHUNK);
            const { error: rmErr } = await admin.storage.from(STORAGE_BUCKET).remove(chunk);
            if (rmErr) {
                removeErrors.push(rmErr.message);
                console.error('[cron/history-retention] erro ao remover lote de fotos:', rmErr.message);
            } else {
                removed += chunk.length;
            }
        }

        return NextResponse.json({
            dryRun: false,
            retentionDays: HISTORY_RETENTION_DAYS,
            issuesDeleted: (data as { issues_deleted?: number }).issues_deleted ?? 0,
            executionsDeleted: (data as { executions_deleted?: number }).executions_deleted ?? 0,
            assumptionsDeleted: (data as { assumptions_deleted?: number }).assumptions_deleted ?? 0,
            photosRemoved: removed,
            removeErrors: removeErrors.length ? removeErrors : undefined,
        });
    } catch (error: unknown) {
        console.error('[cron/history-retention] erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
