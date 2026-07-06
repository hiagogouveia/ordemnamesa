'use client';

import { useState } from 'react';
import type { AuditFilters } from '@/lib/types/audit';
import type { Scope } from '@/lib/types/scope';
import type { ReportMode } from '@/lib/pdf/auditoria/format';
import { useExportRelatoriosLote, type ExportFormat } from '@/lib/hooks/use-export-relatorios-lote';

interface Props {
    scope: Scope;
    isGlobal: boolean;
    accountName: string | null;
    filters: AuditFilters;
    assumptionIds: string[];
    onClose: () => void;
}

/**
 * Modal de exportação em lote (PDF combinado — Fase 2).
 * Fluxo: escolher modo (Completo/Resumido) → progresso (barra, %, X/N, cancelar)
 * → resultado com erros parciais e opção de reprocessar só os que falharam.
 */
export function BatchExportModal({ scope, isGlobal, accountName, filters, assumptionIds, onClose }: Props) {
    const { state, start, cancel, reset } = useExportRelatoriosLote();
    const [mode, setMode] = useState<ReportMode>('full');
    const [format, setFormat] = useState<ExportFormat>('pdf_combined');

    const isRunning = state.status === 'preparing' || state.status === 'processing' || state.status === 'rendering';
    const isConfig = state.status === 'idle';
    const isFinished = state.status === 'done' || state.status === 'cancelled' || state.status === 'error';
    const pct = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;

    function run(ids: string[]) {
        start({ scope, assumptionIds: ids, filters, mode, format, isGlobal, accountName });
    }

    const failedIds = state.errors.map(e => e.assumptionId);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => { if (!isRunning) onClose(); }}
        >
            <div
                className="w-full max-w-lg bg-[#101d22] rounded-xl border border-[#325a67] shadow-2xl p-6"
                onClick={e => e.stopPropagation()}
            >
                {/* Cabeçalho */}
                <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-[#13b6ec]">picture_as_pdf</span>
                    <h3 className="text-white font-bold text-lg">Exportar {assumptionIds.length} {assumptionIds.length === 1 ? 'relatório' : 'relatórios'}</h3>
                </div>

                {/* ── Configuração (escolha de modo) ── */}
                {isConfig && (
                    <>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-[#557682] mb-2">Formato</p>
                        <div className="flex flex-col gap-2 mb-4">
                            <ModeOption
                                active={format === 'pdf_combined'}
                                onClick={() => setFormat('pdf_combined')}
                                icon="picture_as_pdf"
                                title="PDF único"
                                desc="Um só arquivo com todos os relatórios (cada um em nova página)."
                            />
                            <ModeOption
                                active={format === 'zip'}
                                onClick={() => setFormat('zip')}
                                icon="folder_zip"
                                title="ZIP (1 PDF por relatório)"
                                desc="Um arquivo .zip com um PDF separado para cada relatório."
                            />
                        </div>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-[#557682] mb-2">Conteúdo</p>
                        <div className="flex flex-col gap-2 mb-5">
                            <ModeOption
                                active={mode === 'full'}
                                onClick={() => setMode('full')}
                                icon="photo_library"
                                title="Completo"
                                desc="Inclui as evidências fotográficas. Maior e mais lento."
                            />
                            <ModeOption
                                active={mode === 'summary'}
                                onClick={() => setMode('summary')}
                                icon="description"
                                title="Resumido"
                                desc="Só texto (itens, status e ocorrências), sem fotos. Muito mais leve."
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#92bbc9] hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => run(assumptionIds)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#13b6ec] hover:bg-[#0fa3d4] transition-colors"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                                {format === 'zip' ? 'Gerar ZIP' : 'Gerar PDF'}
                            </button>
                        </div>
                    </>
                )}

                {/* ── Progresso ── */}
                {isRunning && (
                    <>
                        <p className="text-[#92bbc9] text-sm mb-3">
                            {state.status === 'preparing' && 'Preparando exportação…'}
                            {state.status === 'processing' && `Processando relatórios… (${state.completed}/${state.total})`}
                            {state.status === 'rendering' && (format === 'zip' ? 'Compactando o ZIP…' : 'Montando o PDF final…')}
                        </p>
                        <div className="h-2.5 rounded-full bg-[#233f48] overflow-hidden">
                            <div
                                className="h-full bg-[#13b6ec] transition-all duration-300"
                                style={{ width: `${state.status === 'rendering' ? 100 : pct}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-[#557682] tabular-nums">
                                {state.status === 'rendering' ? '100' : pct}%
                            </span>
                            {state.errors.length > 0 && (
                                <span className="text-xs text-amber-400">{state.errors.length} com falha</span>
                            )}
                        </div>
                        {state.status === 'processing' && (
                            <div className="flex justify-end mt-5">
                                <button
                                    type="button"
                                    onClick={cancel}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-[#92bbc9] hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ── Resultado ── */}
                {isFinished && (
                    <>
                        <div className={`flex items-start gap-3 mb-4 ${state.status === 'error' ? 'text-red-400' : 'text-[#92bbc9]'}`}>
                            <span className={`material-symbols-outlined mt-0.5 ${
                                state.status === 'done' ? 'text-emerald-400'
                                : state.status === 'cancelled' ? 'text-amber-400' : 'text-red-400'
                            }`}>
                                {state.status === 'done' ? 'check_circle' : state.status === 'cancelled' ? 'cancel' : 'error'}
                            </span>
                            <p className="text-sm">{state.message}</p>
                        </div>

                        {state.rejected.length > 0 && (
                            <p className="text-xs text-amber-400 mb-2">
                                {state.rejected.length} registro(s) fora do escopo foram ignorados.
                            </p>
                        )}

                        {state.errors.length > 0 && (
                            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-[#325a67] bg-[#16262c] p-3">
                                <p className="text-xs uppercase tracking-wider font-bold text-amber-400 mb-1.5">
                                    Relatórios com falha
                                </p>
                                <ul className="space-y-1">
                                    {state.errors.map(err => (
                                        <li key={err.assumptionId} className="text-xs text-[#92bbc9]">
                                            <span className="text-[#557682]">{err.assumptionId.slice(0, 8)}…</span> — {err.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            {failedIds.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { reset(); run(failedIds); }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
                                    Tentar os que falharam
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#13b6ec] hover:bg-[#0fa3d4] transition-colors"
                            >
                                Fechar
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function ModeOption({ active, onClick, icon, title, desc }: {
    active: boolean;
    onClick: () => void;
    icon: string;
    title: string;
    desc: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-start gap-3 text-left p-3 rounded-lg border transition-colors ${
                active ? 'border-[#13b6ec] bg-[#13b6ec]/10' : 'border-[#325a67] bg-[#16262c] hover:border-[#13b6ec]/40'
            }`}
        >
            <span className={`material-symbols-outlined ${active ? 'text-[#13b6ec]' : 'text-[#92bbc9]'}`}>{icon}</span>
            <div className="flex-1">
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-[#92bbc9] text-xs mt-0.5">{desc}</p>
            </div>
            <span className={`material-symbols-outlined text-[18px] ${active ? 'text-[#13b6ec]' : 'text-transparent'}`}>
                check_circle
            </span>
        </button>
    );
}
