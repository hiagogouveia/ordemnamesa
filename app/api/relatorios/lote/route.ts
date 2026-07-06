/**
 * POST /api/relatorios/lote   — MANIFESTO da exportação em lote
 * PATCH /api/relatorios/lote  — desfecho best-effort (completed/cancelled/failed)
 *
 * O POST é intencionalmente barato: NÃO carrega os detalhes nem as fotos do lote.
 * Ele apenas (a) autentica e valida o escopo, (b) confirma que TODOS os ids
 * pertencem ao(s) restaurante(s) do escopo, (c) aloca um document_uuid por
 * relatório e (d) grava o evento de auditoria `dispatched` (egresso de dados).
 * O cliente então busca cada detalhe sob demanda via GET /api/relatorios/[id]
 * (streaming — memória ~constante). Ver §9 do plano.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveGlobalScope, isGlobalScopeResult } from '@/lib/api/global-scope';
import { filtersToSearchParams, parseFiltersFromSearchParams } from '@/lib/services/audit-service';
import type { AuditFilters, UnitInfo } from '@/lib/types/audit';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';
import { DEFAULT_TZ } from '@/lib/utils/brazil-date';

/** Teto de segurança anti-abuso (não é limite de produto — o orçamento real de
 *  memória é aplicado no cliente sobre o volume de imagens efetivamente carregado). */
const MAX_BATCH_ITEMS = 200;

type ExportFormat = 'pdf_combined' | 'zip';
type ReportMode = 'full' | 'summary';

const getAdminSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface ScopeResolution {
    restaurantIds: string[];
    unitsById: Record<string, UnitInfo>;
    isGlobal: boolean;
}

async function resolveScope(
    request: Request,
    admin: SupabaseClient,
    userId: string,
): Promise<ScopeResolution | NextResponse> {
    const { searchParams } = new URL(request.url);
    const restaurant_id = searchParams.get('restaurant_id');
    const account_id = searchParams.get('account_id');
    const isGlobal = searchParams.get('mode') === 'global';

    if (isGlobal) {
        if (!account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório em modo global' }, { status: 400 });
        }
        const result = await resolveGlobalScope(admin, account_id, userId);
        if (!isGlobalScopeResult(result)) return result;
        return { restaurantIds: result.restaurantIds, unitsById: result.unitsById, isGlobal: true };
    }

    if (!restaurant_id) {
        return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
    }

    const { data: membership } = await admin
        .from('restaurant_users')
        .select('role')
        .eq('restaurant_id', restaurant_id)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();

    if (!membership || membership.role === 'staff') {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    return { restaurantIds: [restaurant_id], unitsById: {}, isGlobal: false };
}

async function authenticate(request: Request, admin: SupabaseClient) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: 'Sem autorização' }, { status: 401 });
    return user;
}

// ─── POST: manifesto ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const admin = getAdminSupabase();
        const user = await authenticate(request, admin);
        if (user instanceof NextResponse) return user;

        const scope = await resolveScope(request, admin, user.id);
        if (scope instanceof NextResponse) return scope;

        const body = await request.json().catch(() => null) as {
            assumptionIds?: unknown;
            filters?: AuditFilters;
            format?: ExportFormat;
            reportMode?: ReportMode;
        } | null;

        const ids = Array.isArray(body?.assumptionIds)
            ? Array.from(new Set((body!.assumptionIds as unknown[]).filter((v): v is string => typeof v === 'string')))
            : [];

        if (ids.length === 0) {
            return NextResponse.json({ error: 'Selecione ao menos um relatório.' }, { status: 400 });
        }
        if (ids.length > MAX_BATCH_ITEMS) {
            return NextResponse.json(
                { error: `Máximo de ${MAX_BATCH_ITEMS} relatórios por exportação.`, code: 'too_many' },
                { status: 413 },
            );
        }

        const format: ExportFormat = body?.format === 'zip' ? 'zip' : 'pdf_combined';
        const reportMode: ReportMode = body?.reportMode === 'summary' ? 'summary' : 'full';

        // Ownership: só os ids que pertencem ao(s) restaurante(s) do escopo.
        const { data: ownedRows, error: ownErr } = await admin
            .from('checklist_assumptions')
            .select('id, restaurant_id')
            .in('id', ids)
            .in('restaurant_id', scope.restaurantIds);
        if (ownErr) throw ownErr;

        const owned = (ownedRows ?? []) as Array<{ id: string; restaurant_id: string }>;
        const authorizedIds = new Set(owned.map(r => r.id));
        const rejected = ids.filter(id => !authorizedIds.has(id));

        if (owned.length === 0) {
            return NextResponse.json({ error: 'Nenhum relatório acessível neste escopo.' }, { status: 404 });
        }

        // Filtros resolvidos (datas reais no fuso do restaurante) para reconstrução na auditoria.
        const tz = scope.restaurantIds[0]
            ? await getRestaurantTimezone(admin, scope.restaurantIds[0])
            : DEFAULT_TZ;
        let resolvedFilters: AuditFilters | null = null;
        if (body?.filters) {
            try {
                resolvedFilters = parseFiltersFromSearchParams(filtersToSearchParams(body.filters), tz);
            } catch {
                resolvedFilters = body.filters; // fallback: guarda o filtro cru (metadado é best-effort)
            }
        }

        // Aloca document_uuid por relatório (rastreabilidade do PDF fora do sistema).
        const documents = owned.map(r => ({
            assumption_id: r.id,
            document_uuid: randomUUID(),
            restaurant_id: r.restaurant_id,
        }));

        // batch_id agrupa as linhas do lote (uma por restaurante — auditoria por tenant íntegra).
        const batchId = randomUUID();
        const byRestaurant = new Map<string, typeof documents>();
        for (const d of documents) {
            const arr = byRestaurant.get(d.restaurant_id) ?? [];
            arr.push(d);
            byRestaurant.set(d.restaurant_id, arr);
        }

        const rows = Array.from(byRestaurant.entries()).map(([restaurantId, docs]) => ({
            restaurant_id: restaurantId,
            actor_id: user.id,
            resource_type: 'audit_reports',
            batch_id: batchId,
            status: 'dispatched',
            item_count: docs.length,
            metadata: {
                format,
                mode: reportMode,
                is_global: scope.isGlobal,
                filters: resolvedFilters,
                documents: docs.map(({ assumption_id, document_uuid }) => ({ assumption_id, document_uuid })),
            },
        }));

        const { error: insErr } = await admin.from('data_export_events').insert(rows);
        if (insErr) throw insErr;

        return NextResponse.json({
            batchId,
            format,
            reportMode,
            items: documents.map(({ assumption_id, document_uuid }) => ({ assumption_id, document_uuid })),
            rejected,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ─── PATCH: desfecho best-effort ─────────────────────────────────────────────

export async function PATCH(request: Request) {
    try {
        const admin = getAdminSupabase();
        const user = await authenticate(request, admin);
        if (user instanceof NextResponse) return user;

        const body = await request.json().catch(() => null) as {
            batchId?: string;
            status?: string;
        } | null;

        const batchId = typeof body?.batchId === 'string' ? body.batchId : null;
        const status = body?.status;
        if (!batchId || !status || !['completed', 'cancelled', 'failed'].includes(status)) {
            return NextResponse.json({ error: 'batchId e status válidos são obrigatórios.' }, { status: 400 });
        }

        // Só o próprio ator atualiza o desfecho das suas linhas (defesa em profundidade
        // além do service-role): filtra por actor_id = user.id e batch_id.
        const { error } = await admin
            .from('data_export_events')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('actor_id', user.id)
            .eq('batch_id', batchId);
        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
