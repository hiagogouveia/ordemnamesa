'use client';

import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AuditExecutionDetail, AuditFilters } from '@/lib/types/audit';
import type { Scope } from '@/lib/types/scope';
import type { AuditReportData, ReportMode } from '@/lib/pdf/auditoria/format';
import { buildReportData } from '@/lib/pdf/auditoria/format';
import { formatNowBR, triggerDownload } from '@/lib/pdf/shared';

/**
 * Exportação em lote de relatórios de auditoria (PDF combinado — Fase 2).
 *
 * Estratégia de memória (§9): o endpoint /lote é só o MANIFESTO (auth +
 * ownership + auditoria + document_uuid). Este hook então busca o detalhe de
 * CADA relatório sob demanda (streaming), processa e libera antes do próximo —
 * memória ~constante. Um relatório que falha não aborta o lote (erro parcial).
 */

export type ExportStatus =
    | 'idle'
    | 'preparing'   // chamando o manifesto
    | 'processing'  // buscando/rendendo relatório a relatório
    | 'rendering'   // montando o PDF final
    | 'done'
    | 'cancelled'
    | 'error';

export interface ExportError {
    assumptionId: string;
    message: string;
}

export interface ExportState {
    status: ExportStatus;
    completed: number;
    total: number;
    errors: ExportError[];
    /** ids rejeitados pelo servidor (fora do escopo / inexistentes). */
    rejected: string[];
    message: string | null;
}

export type ExportFormat = 'pdf_combined' | 'zip';

export interface StartParams {
    scope: Scope;
    assumptionIds: string[];
    filters: AuditFilters;
    mode: ReportMode;
    format: ExportFormat;
    isGlobal: boolean;
    accountName: string | null;
}

interface ManifestResponse {
    batchId: string;
    format: string;
    reportMode: ReportMode;
    items: Array<{ assumption_id: string; document_uuid: string }>;
    rejected: string[];
}

const INITIAL: ExportState = {
    status: 'idle',
    completed: 0,
    total: 0,
    errors: [],
    rejected: [],
    message: null,
};

function buildScopeParams(scope: Scope): URLSearchParams {
    const sp = new URLSearchParams();
    if (scope.mode === 'global') {
        sp.set('mode', 'global');
        sp.set('account_id', scope.accountId);
    } else {
        sp.set('restaurant_id', scope.restaurantId);
    }
    return sp;
}

export function useExportRelatoriosLote() {
    const [state, setState] = useState<ExportState>(INITIAL);
    const cancelRef = useRef(false);
    const runningRef = useRef(false);

    const cancel = useCallback(() => { cancelRef.current = true; }, []);
    const reset = useCallback(() => {
        cancelRef.current = false;
        setState(INITIAL);
    }, []);

    const start = useCallback(async (params: StartParams) => {
        if (runningRef.current) return;
        runningRef.current = true;
        cancelRef.current = false;

        const supabase = createClient();
        const scopeParams = buildScopeParams(params.scope);

        let batchId: string | null = null;
        const patchOutcome = async (status: 'completed' | 'cancelled' | 'failed') => {
            if (!batchId) return;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token ?? '';
                await fetch(`/api/relatorios/lote?${scopeParams.toString()}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ batchId, status }),
                    keepalive: true,
                });
            } catch { /* best-effort — nunca é fonte de verdade da auditoria (§1) */ }
        };

        try {
            setState({ ...INITIAL, status: 'preparing' });

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token ?? '';

            // 1) Manifesto
            const manifestRes = await fetch(`/api/relatorios/lote?${scopeParams.toString()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    assumptionIds: params.assumptionIds,
                    filters: params.filters,
                    format: params.format,
                    reportMode: params.mode,
                }),
            });
            if (!manifestRes.ok) {
                const body = await manifestRes.json().catch(() => ({}));
                throw new Error(body.error ?? 'Falha ao preparar a exportação.');
            }
            const manifest = await manifestRes.json() as ManifestResponse;
            batchId = manifest.batchId;

            const total = manifest.items.length;
            const errors: ExportError[] = [];
            setState({
                status: 'processing', completed: 0, total,
                errors: [], rejected: manifest.rejected ?? [], message: null,
            });

            // 2) Nome do restaurante + logo (único: da unidade; global: nome da conta).
            let restaurantName = params.accountName ?? 'Todas as unidades';
            let logoDataUrl: string | undefined;
            if (!params.isGlobal && params.scope.mode === 'single') {
                const { data: rest } = await supabase
                    .from('restaurants')
                    .select('name, logo_url')
                    .eq('id', params.scope.restaurantId)
                    .maybeSingle();
                if (rest?.name) restaurantName = rest.name;
                if (rest?.logo_url) {
                    const { loadImageAsDataUrl } = await import('@/lib/pdf/shared');
                    logoDataUrl = await loadImageAsDataUrl(rest.logo_url);
                }
            }

            // Nome de quem exporta
            let exportedBy = 'Gestor';
            const userId = session?.user?.id;
            if (userId) {
                const { data: u } = await supabase.from('users').select('name').eq('id', userId).maybeSingle();
                exportedBy = u?.name ?? session?.user?.email ?? 'Gestor';
            }

            // Logo da marca + carregador de imagens (import dinâmico do gerador)
            const {
                loadImagesForDetail, renderAuditoriaPdfBlob,
                buildAuditBatchFilename, buildAuditZipFilename, buildReportEntryFilename,
                BRAND_LOGO_URL,
            } = await import('@/lib/pdf/auditoria/generate');
            const { loadImageAsDataUrl } = await import('@/lib/pdf/shared');
            const brandLogoDataUrl = await loadImageAsDataUrl(BRAND_LOGO_URL);

            const generatedAt = formatNowBR();
            const docBase = { restaurantName, exportedBy, generatedAt, mode: params.mode, logoDataUrl, brandLogoDataUrl };
            const isZip = params.format === 'zip';

            // ZIP: empacota 1 PDF por relatório, renderizando e liberando dentro do loop
            // (memória ~constante — §9). PDF combinado: acumula os dados e renderiza no fim.
            const reports: AuditReportData[] = [];
            const zip = isZip ? new (await import('jszip')).default() : null;
            let zipCount = 0;

            // 3) Streaming: detalhe por relatório
            for (const item of manifest.items) {
                if (cancelRef.current) break;
                try {
                    const detailRes = await fetch(
                        `/api/relatorios/${item.assumption_id}?${scopeParams.toString()}`,
                        { headers: { Authorization: `Bearer ${token}` } },
                    );
                    if (!detailRes.ok) {
                        const body = await detailRes.json().catch(() => ({}));
                        throw new Error(body.error ?? `HTTP ${detailRes.status}`);
                    }
                    const detail = await detailRes.json() as AuditExecutionDetail;
                    const images = params.mode === 'full'
                        ? await loadImagesForDetail(detail)
                        : new Map<string, string>();
                    const report = buildReportData(detail, item.document_uuid, params.mode, images);

                    if (zip) {
                        const blob = await renderAuditoriaPdfBlob({ ...docBase, reports: [report] });
                        zip.file(buildReportEntryFilename(report.checklistName, report.dateLabel, report.documentUuid), blob);
                        zipCount++;
                        // report/images saem de escopo aqui → elegíveis a GC antes do próximo
                    } else {
                        reports.push(report);
                    }
                } catch (e) {
                    errors.push({
                        assumptionId: item.assumption_id,
                        message: e instanceof Error ? e.message : 'Falha ao carregar relatório',
                    });
                }
                setState(prev => ({ ...prev, completed: prev.completed + 1, errors: [...errors] }));
            }

            const generatedCount = isZip ? zipCount : reports.length;

            // 4) Cancelamento
            if (cancelRef.current) {
                await patchOutcome('cancelled');
                setState(prev => ({ ...prev, status: 'cancelled', message: 'Exportação cancelada.' }));
                return;
            }

            // 5) Todos falharam
            if (generatedCount === 0) {
                await patchOutcome('failed');
                setState(prev => ({ ...prev, status: 'error', message: 'Nenhum relatório pôde ser gerado.' }));
                return;
            }

            // 6) Empacota / renderiza + download
            setState(prev => ({ ...prev, status: 'rendering' }));
            if (zip) {
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                triggerDownload(zipBlob, buildAuditZipFilename(generatedCount));
            } else {
                const blob = await renderAuditoriaPdfBlob({ ...docBase, reports });
                triggerDownload(blob, buildAuditBatchFilename(generatedCount));
            }

            await patchOutcome('completed');
            setState(prev => ({
                ...prev,
                status: 'done',
                message: errors.length > 0
                    ? `${generatedCount} gerado(s), ${errors.length} com falha.`
                    : `${generatedCount} relatório(s) exportado(s).`,
            }));
        } catch (e) {
            await patchOutcome('failed');
            setState(prev => ({
                ...prev,
                status: 'error',
                message: e instanceof Error ? e.message : 'Erro inesperado na exportação.',
            }));
        } finally {
            runningRef.current = false;
        }
    }, []);

    return { state, start, cancel, reset };
}
