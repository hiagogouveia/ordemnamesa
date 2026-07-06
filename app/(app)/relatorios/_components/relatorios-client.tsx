'use client';

import { useMemo, useState } from 'react';
import { downloadRelatorioCsv, useRelatorios } from '@/lib/hooks/use-relatorios';
import { DEFAULT_FILTERS } from '@/lib/services/audit-service';
import type { AuditFilters, PeriodPreset } from '@/lib/types/audit';
import { AUDIT_STATUS_LABEL, SHIFT_LABEL } from '@/lib/types/audit';
import type { Scope } from '@/lib/types/scope';
import { AuditFiltersBar } from './audit-filters';
import { AuditExecutionList } from './audit-execution-list';
import { AuditExecutionPanel } from './audit-execution-panel';
import { BatchExportModal } from './batch-export-modal';

const PRESET_LABEL: Record<PeriodPreset, string> = {
    today: 'Hoje',
    '7days': 'Últimos 7 dias',
    '30days': 'Últimos 30 dias',
    custom: 'Período personalizado',
};

interface Props {
    scope: Scope;
    isGlobal: boolean;
    accountName: string | null;
}

export function RelatoriosClient({ scope, isGlobal, accountName }: Props) {
    const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [csvLoading, setCsvLoading] = useState(false);
    const [csvError, setCsvError] = useState<string | null>(null);

    // ── Seleção em lote ──
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    // Mudança de filtro/página pendente de confirmação (quando há seleção ativa).
    const [pendingFilters, setPendingFilters] = useState<AuditFilters | null>(null);
    const [exportOpen, setExportOpen] = useState(false);

    const { data, isLoading, isFetching, error } = useRelatorios(scope, filters);

    const entries = data?.entries ?? [];
    const total = data?.total ?? 0;

    const activeChips = useMemo(() => buildActiveChips(filters), [filters]);

    /** Aplica a mudança de filtros e descarta a seleção (fora da página/escopo atual). */
    function applyFilters(next: AuditFilters) {
        setFilters(next);
        setSelectedIds(new Set());
    }

    /** Trocar filtro/página limpa a seleção — pede confirmação se houver itens marcados (§6). */
    function requestFilters(next: AuditFilters) {
        if (selectedIds.size > 0) {
            setPendingFilters(next);
            return;
        }
        setFilters(next);
    }

    function toggleOne(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function togglePage(ids: string[], select: boolean) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            for (const id of ids) {
                if (select) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    }

    async function handleExportCsv() {
        setCsvLoading(true);
        setCsvError(null);
        try {
            await downloadRelatorioCsv(scope, filters);
        } catch (e) {
            setCsvError(e instanceof Error ? e.message : 'Falha ao gerar CSV');
        } finally {
            setCsvLoading(false);
        }
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#101d22]">
            <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10">
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">

                    {/* ── Cabeçalho ── */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-[#92bbc9]">
                                <span className="material-symbols-outlined">fact_check</span>
                                <span className="text-xs uppercase tracking-wider font-bold">
                                    Central de Auditoria Operacional
                                </span>
                            </div>
                            <h1 className="text-white text-3xl md:text-4xl font-black tracking-tight">
                                Relatórios
                            </h1>
                            <p className="text-[#92bbc9] text-sm max-w-2xl">
                                {isGlobal
                                    ? `Histórico auditável das execuções de todas as unidades${accountName ? ` · ${accountName}` : ''}.`
                                    : 'Histórico auditável das execuções, com evidências, observações e status por tarefa.'}
                            </p>
                        </div>
                        <button
                            onClick={handleExportCsv}
                            disabled={csvLoading || isLoading}
                            className="self-start md:self-auto inline-flex items-center justify-center gap-2 bg-[#13b6ec] hover:bg-[#0fa3d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-lg transition-colors active:scale-[0.99]"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                {csvLoading ? 'progress_activity' : 'download'}
                            </span>
                            {csvLoading ? 'Gerando...' : 'Exportar CSV'}
                        </button>
                    </div>

                    {/* ── Filtros ── */}
                    <AuditFiltersBar scope={scope} filters={filters} onChange={requestFilters} />

                    {/* ── Resumo leve ── */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                        <div className="flex items-center gap-2 text-sm text-[#92bbc9]">
                            <span className="font-bold text-white">
                                {isFetching ? '…' : entries.length}
                            </span>
                            {filters.statuses.length > 0 ? (
                                <span>
                                    de até <span className="text-white">{total}</span> {pluralize(total, 'registro', 'registros')} no período
                                </span>
                            ) : (
                                <span>
                                    {pluralize(entries.length, 'registro', 'registros')} de <span className="text-white">{total}</span>
                                </span>
                            )}
                            <span className="text-[#557682]">·</span>
                            <span>{PRESET_LABEL[filters.preset]}</span>
                        </div>
                        {activeChips.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {activeChips.map((c, i) => (
                                    <span
                                        key={i}
                                        className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-[#13b6ec]/10 text-[#13b6ec] border border-[#13b6ec]/20"
                                    >
                                        {c}
                                    </span>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => requestFilters(DEFAULT_FILTERS)}
                                    className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full text-[#92bbc9] hover:text-white"
                                >
                                    Limpar
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Erros ── */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-900/50 rounded-xl p-4 text-red-400 text-sm">
                            <p className="font-medium">Erro ao carregar a lista</p>
                            <p className="text-xs mt-0.5 opacity-80">{error.message}</p>
                        </div>
                    )}
                    {csvError && (
                        <div className="bg-red-500/10 border border-red-900/50 rounded-xl p-3 text-red-400 text-sm">
                            {csvError}
                        </div>
                    )}

                    {/* ── Lista ── */}
                    <AuditExecutionList
                        entries={entries}
                        isLoading={isLoading}
                        isGlobal={isGlobal}
                        onSelect={setSelectedId}
                        selectedIds={selectedIds}
                        onToggle={toggleOne}
                        onTogglePage={togglePage}
                    />

                    {/* ── Paginação ── */}
                    <Pagination
                        page={filters.page}
                        limit={filters.limit}
                        total={total}
                        currentCount={entries.length}
                        onChange={page => requestFilters({ ...filters, page })}
                    />
                </div>
            </div>

            {/* ── Barra de ação da seleção em lote ── */}
            <BatchSelectionBar
                count={selectedIds.size}
                onClear={() => setSelectedIds(new Set())}
                onExport={() => setExportOpen(true)}
            />

            {/* ── Confirmação ao perder seleção (§6) ── */}
            <ConfirmLoseSelectionDialog
                open={pendingFilters !== null}
                count={selectedIds.size}
                onCancel={() => setPendingFilters(null)}
                onConfirm={() => {
                    if (pendingFilters) applyFilters(pendingFilters);
                    setPendingFilters(null);
                }}
            />

            {/* ── Exportação em lote ── */}
            {exportOpen && (
                <BatchExportModal
                    scope={scope}
                    isGlobal={isGlobal}
                    accountName={accountName}
                    filters={filters}
                    assumptionIds={Array.from(selectedIds)}
                    onClose={() => setExportOpen(false)}
                />
            )}

            <AuditExecutionPanel
                scope={scope}
                assumptionId={selectedId}
                onClose={() => setSelectedId(null)}
            />
        </div>
    );
}

// ─── Barra de ação da seleção ────────────────────────────────────────────────

interface BatchSelectionBarProps {
    count: number;
    onClear: () => void;
    onExport: () => void;
}

/** Barra flutuante inferior — aparece só quando há ≥1 registro selecionado. */
function BatchSelectionBar({ count, onClear, onExport }: BatchSelectionBarProps) {
    if (count === 0) return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
            <div className="pointer-events-auto flex items-center gap-3 bg-[#16262c] border border-[#325a67] shadow-2xl rounded-2xl px-4 py-3">
                <span className="material-symbols-outlined text-[#13b6ec]">checklist</span>
                <span className="text-sm text-white font-semibold whitespace-nowrap">
                    {count} {count === 1 ? 'selecionado' : 'selecionados'}
                </span>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-xs uppercase tracking-wider font-bold px-3 py-1.5 rounded-lg text-[#92bbc9] hover:text-white transition-colors"
                >
                    Limpar
                </button>
                <button
                    type="button"
                    onClick={onExport}
                    className="inline-flex items-center gap-2 bg-[#13b6ec] hover:bg-[#0fa3d4] text-white font-bold py-2 px-4 rounded-lg transition-colors active:scale-[0.99]"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span>
                    Exportar selecionados
                </button>
            </div>
        </div>
    );
}

// ─── Confirmação ao perder seleção ───────────────────────────────────────────

interface ConfirmLoseSelectionDialogProps {
    open: boolean;
    count: number;
    onCancel: () => void;
    onConfirm: () => void;
}

function ConfirmLoseSelectionDialog({ open, count, onCancel, onConfirm }: ConfirmLoseSelectionDialogProps) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div
                className="w-full max-w-md bg-[#101d22] rounded-xl border border-[#325a67] shadow-2xl p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-amber-400 mt-0.5">warning</span>
                    <div className="flex-1">
                        <h3 className="text-white font-bold text-lg">Descartar seleção?</h3>
                        <p className="text-[#92bbc9] text-sm mt-1">
                            Você tem <span className="text-white font-semibold">{count}</span>{' '}
                            {count === 1 ? 'relatório selecionado' : 'relatórios selecionados'}. Alterar os
                            filtros ou a página vai limpar essa seleção.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-[#92bbc9] hover:text-white transition-colors"
                    >
                        Manter seleção
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors"
                    >
                        Continuar e limpar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pluralize(n: number, singular: string, plural: string): string {
    return n === 1 ? singular : plural;
}

function buildActiveChips(filters: AuditFilters): string[] {
    const chips: string[] = [];
    if (filters.kind === 'routine') chips.push('Tipo: Rotinas');
    else if (filters.kind === 'receiving') chips.push('Tipo: Recebimentos');
    if (filters.supplier_ids.length) chips.push(`${filters.supplier_ids.length} ${pluralize(filters.supplier_ids.length, 'fornecedor', 'fornecedores')}`);
    if (filters.search.trim()) chips.push(`Busca: "${filters.search.trim()}"`);
    if (filters.area_ids.length) chips.push(`${filters.area_ids.length} ${pluralize(filters.area_ids.length, 'área', 'áreas')}`);
    if (filters.user_ids.length) chips.push(`${filters.user_ids.length} ${pluralize(filters.user_ids.length, 'colaborador', 'colaboradores')}`);
    if (filters.shifts.length) chips.push(`Turnos: ${filters.shifts.map(s => SHIFT_LABEL[s]).join(', ')}`);
    if (filters.statuses.length) chips.push(`Status: ${filters.statuses.map(s => AUDIT_STATUS_LABEL[s]).join(', ')}`);
    return chips;
}

interface PaginationProps {
    page: number;
    limit: number;
    total: number;
    currentCount: number;
    onChange: (page: number) => void;
}

function Pagination({ page, limit, total, currentCount, onChange }: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = total === 0 ? 0 : page * limit + 1;
    const end = Math.min((page + 1) * limit, total);
    const canPrev = page > 0;
    const canNext = (page + 1) < totalPages && currentCount > 0;

    if (total === 0) return null;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#16262c] border border-[#325a67] rounded-xl px-4 py-3">
            <div className="text-xs text-[#92bbc9]">
                <span className="hidden sm:inline">Mostrando </span>
                <span className="text-white font-semibold">{start}–{end}</span>
                <span> de </span>
                <span className="text-white font-semibold">{total}</span>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    disabled={!canPrev}
                    onClick={() => onChange(page - 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#325a67] bg-[#101d22] text-[#92bbc9] hover:text-white hover:border-[#13b6ec]/40 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                    Anterior
                </button>
                <span className="text-xs text-[#557682] tabular-nums">
                    Página {page + 1} de {totalPages}
                </span>
                <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => onChange(page + 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#325a67] bg-[#101d22] text-[#92bbc9] hover:text-white hover:border-[#13b6ec]/40 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Próxima
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                </button>
            </div>
        </div>
    );
}
