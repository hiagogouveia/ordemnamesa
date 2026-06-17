'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRelatorioDetail } from '@/lib/hooks/use-relatorios-detail';
import {
    AUDIT_STATUS_LABEL,
    AUDIT_TASK_STATUS_LABEL,
    SHIFT_LABEL,
    TASK_ISSUE_STATUS_LABEL,
} from '@/lib/types/audit';
import type { AuditExecutionDetail, AuditTaskDetail } from '@/lib/types/audit';
import type { Scope } from '@/lib/types/scope';

/**
 * Página de impressão / geração de PDF.
 * Layout otimizado para A4 retrato + window.print() (usuário escolhe
 * "Salvar como PDF" no diálogo nativo do navegador).
 *
 * Mora FORA do route group (app) para não herdar Sidebar/Header — fica chrome-less.
 * Autorização é validada pela API (/api/relatorios/[id] exige role owner/manager).
 */
export default function ImprimirRelatorioPage() {
    const params = useParams<{ id: string }>();
    const sp = useSearchParams();

    const scope = useMemo<Scope | null>(() => {
        const mode = sp.get('mode');
        const accountId = sp.get('account_id');
        const restaurantId = sp.get('restaurant_id');
        if (mode === 'global' && accountId) return { mode: 'global', accountId };
        if (restaurantId) return { mode: 'single', restaurantId };
        return null;
    }, [sp]);

    const { data: detail, isLoading, error } = useRelatorioDetail(scope, params.id ?? null);

    // Auto-abre diálogo de impressão quando os dados carregam
    useEffect(() => {
        if (!detail) return;
        const t = setTimeout(() => {
            try { window.print(); } catch { /* noop */ }
        }, 600);
        return () => clearTimeout(t);
    }, [detail]);

    if (!scope) return <Notice message="Escopo não fornecido na URL." />;
    if (isLoading) return <Notice message="Carregando relatório..." />;
    if (error) return <Notice message={`Erro: ${error.message}`} />;
    if (!detail) return <Notice message="Execução não encontrada." />;

    return <PrintLayout detail={detail} />;
}

function Notice({ message }: { message: string }) {
    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-white text-slate-700">
            <p className="text-sm">{message}</p>
        </div>
    );
}

function PrintLayout({ detail }: { detail: AuditExecutionDetail }) {
    return (
        <div className="bg-white text-slate-900 min-h-screen print:min-h-0">
            {/* Toolbar visível só na tela */}
            <div className="print:hidden sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                    <span className="material-symbols-outlined">print</span>
                    <span className="text-sm font-semibold">Pré-visualização do relatório</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white text-sm font-bold px-4 py-2 rounded-lg"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                        Imprimir / Salvar PDF
                    </button>
                    <button
                        type="button"
                        onClick={() => window.close()}
                        className="text-sm text-slate-500 hover:text-slate-900 px-3 py-2"
                    >
                        Fechar
                    </button>
                </div>
            </div>

            <article className="max-w-[820px] mx-auto px-8 py-10 print:px-0 print:py-0 print:max-w-none">
                {/* Cabeçalho */}
                <header className="flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-900">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold mb-1">
                            Ordem na Mesa
                        </p>
                        <h1 className="text-2xl font-black text-slate-900 leading-tight">
                            Relatório oficial de auditoria
                        </h1>
                        <p className="text-sm text-slate-600 mt-1">{detail.checklist.name}</p>
                    </div>
                    <div className="text-right text-sm">
                        <p className="text-slate-500">
                            <span className="font-semibold text-slate-700">Status:</span>{' '}
                            <span className="font-bold uppercase">{AUDIT_STATUS_LABEL[detail.status]}</span>
                            {detail.had_impediment && (
                                <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-300 align-middle">
                                    teve impedimento
                                </span>
                            )}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                            <span className="font-semibold text-slate-700">Data:</span>{' '}
                            {formatDate(detail.assumed_at)}
                        </p>
                        {detail.unit && (
                            <p className="text-slate-500 mt-0.5">
                                <span className="font-semibold text-slate-700">Unidade:</span>{' '}
                                {detail.unit.name}
                            </p>
                        )}
                    </div>
                </header>

                <section className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <Meta label="Área" value={detail.area?.name ?? '—'} />
                    <Meta label="Turno" value={detail.checklist.shift ? SHIFT_LABEL[detail.checklist.shift] : '—'} />
                    <Meta label="Responsável" value={detail.user.name} />
                    <Meta label="Duração" value={formatDuration(detail.duration_seconds)} />
                </section>

                <section className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <Meta label="Iniciado em" value={formatDateTime(detail.assumed_at)} />
                    <Meta
                        label="Concluído em"
                        value={detail.completed_at ? formatDateTime(detail.completed_at) : '—'}
                    />
                </section>

                {detail.issues.length > 0 && (() => {
                    const isImpediment = detail.status === 'impediment';
                    const border = isImpediment ? 'border-red-300' : 'border-amber-300';
                    const bg = isImpediment ? 'bg-red-50' : 'bg-amber-50';
                    const titleColor = isImpediment ? 'text-red-800' : 'text-amber-800';
                    const bodyColor = isImpediment ? 'text-red-900' : 'text-amber-900';
                    return (
                        <section className={`mt-5 border ${border} ${bg} rounded-md px-4 py-3`}>
                            <p className={`text-xs uppercase tracking-wider ${titleColor} font-bold mb-1`}>
                                Ocorrências durante execução ({detail.issues.length})
                            </p>
                            <p className={`text-sm ${bodyColor}`}>
                                {isImpediment
                                    ? 'Rotina encerrada com ocorrência pendente (tarefa afetada não concluída). Status final: Com impedimento.'
                                    : 'Houve ocorrência durante a execução, mas a rotina foi concluída. Status final: Concluída.'}
                            </p>
                            <ul className={`mt-2 text-xs ${bodyColor} space-y-2`}>
                                {detail.issues.map(issue => (
                                    <li key={issue.id} className="border-t border-black/10 pt-2 first:border-t-0 first:pt-0">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="font-semibold">{issue.task_title}</span>
                                            <span className="uppercase text-[10px] tracking-wide">
                                                {issue.is_pending ? 'Pendente' : TASK_ISSUE_STATUS_LABEL[issue.status]}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 whitespace-pre-wrap">{issue.description}</p>
                                        <p className="text-[10px] opacity-70 mt-0.5">
                                            Reportado por {issue.reporter_name} · {formatDateTime(issue.created_at)}
                                            {issue.photos.length > 0 && ` · ${issue.photos.length} foto(s)`}
                                        </p>
                                        {issue.manager_comment && (
                                            <p className="mt-1"><span className="font-semibold">Gestor:</span> {issue.manager_comment}</p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {detail.issues.some(i => i.photos.length > 0) && (
                                <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {detail.issues.flatMap(issue =>
                                        issue.photos
                                            .filter(p => !!p.signed_url)
                                            .map((p, i) => (
                                                <figure key={`${issue.id}-${i}`} className="border border-black/10 rounded overflow-hidden">
                                                    <div className="aspect-square bg-slate-100 flex items-center justify-center">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={p.signed_url!} alt={`Evidência da ocorrência: ${issue.task_title}`} className="w-full h-full object-cover" />
                                                    </div>
                                                </figure>
                                            )),
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })()}

                {detail.impediment_reason && (
                    <section className="mt-5 border border-slate-300 bg-slate-50 rounded-md px-4 py-3">
                        <p className="text-xs uppercase tracking-wider text-slate-700 font-bold mb-1">
                            Observação registrada na conclusão
                        </p>
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">{detail.impediment_reason}</p>
                    </section>
                )}

                {!detail.tasks.some(t => t.execution_id !== null) && detail.tasks.length > 0 && (
                    <section className="mt-7 border border-slate-300 bg-slate-50 rounded-md px-4 py-3">
                        <p className="text-sm font-semibold text-slate-900">
                            Esta rotina foi finalizada sem detalhamento de tarefas.
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                            A conclusão foi registrada pelo responsável sem marcar cada item individualmente.
                            Status, horários e responsável da finalização constam acima neste documento.
                        </p>
                    </section>
                )}

                {detail.tasks.some(t => t.execution_id !== null) && (<section className="mt-7">
                    <h2 className="text-base font-bold text-slate-900 mb-3 pb-1 border-b border-slate-300">
                        Itens inspecionados
                    </h2>
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-100 text-left">
                                <th className="border border-slate-300 px-3 py-2 w-10">#</th>
                                <th className="border border-slate-300 px-3 py-2">Item verificado</th>
                                <th className="border border-slate-300 px-3 py-2 w-32 text-center">Status</th>
                                <th className="border border-slate-300 px-3 py-2 w-28 text-center">Horário</th>
                                <th className="border border-slate-300 px-3 py-2">Observação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detail.tasks.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                                        Esta rotina não possui itens cadastrados.
                                    </td>
                                </tr>
                            )}
                            {detail.tasks.map((t, idx) => (
                                <tr key={t.task_id} className="align-top">
                                    <td className="border border-slate-300 px-3 py-2 text-slate-500 tabular-nums">{idx + 1}</td>
                                    <td className="border border-slate-300 px-3 py-2">
                                        <div className="font-semibold text-slate-900">
                                            {t.title}
                                            {t.is_critical && (
                                                <span className="ml-1.5 text-[10px] uppercase tracking-wider text-red-700 font-bold">
                                                    (crítica)
                                                </span>
                                            )}
                                        </div>
                                        {t.description && (
                                            <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                                        )}
                                    </td>
                                    <td className="border border-slate-300 px-3 py-2 text-center">
                                        <PrintStatusBadge status={t.status} />
                                    </td>
                                    <td className="border border-slate-300 px-3 py-2 text-center text-xs text-slate-700">
                                        {t.executed_at ? formatTime(t.executed_at) : '—'}
                                    </td>
                                    <td className="border border-slate-300 px-3 py-2 text-xs">
                                        {t.task_type === 'rating' && t.value_rating != null && (
                                            <p className="text-slate-900 font-medium">
                                                <span style={{ color: '#0f172a', letterSpacing: '1px' }}>{formatStars(t.value_rating)}</span>
                                                <span className="text-slate-500 ml-1">({t.value_rating}/5)</span>
                                            </p>
                                        )}
                                        {t.observation && (
                                            <p className="text-slate-700 whitespace-pre-wrap">{t.observation}</p>
                                        )}
                                        {t.impediment_reason && (
                                            <p className="text-orange-700 mt-1 whitespace-pre-wrap">
                                                <span className="font-semibold">Impedimento:</span> {t.impediment_reason}
                                            </p>
                                        )}
                                        {!t.observation && !t.impediment_reason && !(t.task_type === 'rating' && t.value_rating != null) && (
                                            <span className="text-slate-400">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>)}

                <Evidences tasks={detail.tasks} />

                <footer className="mt-10 pt-4 border-t border-slate-300 text-[10px] text-slate-500 flex items-center justify-between">
                    <span>Documento gerado automaticamente pela plataforma Ordem na Mesa.</span>
                    <span>{formatDateTime(new Date().toISOString())}</span>
                </footer>
            </article>

            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 14mm; }
                    body { background: white !important; }
                    .print\\:hidden { display: none !important; }
                }
            `}</style>
        </div>
    );
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
            <p className="text-slate-900 font-medium">{value}</p>
        </div>
    );
}

function PrintStatusBadge({ status }: { status: AuditTaskDetail['status'] }) {
    const styleByStatus: Record<AuditTaskDetail['status'], { bg: string; color: string }> = {
        completed:  { bg: '#dcfce7', color: '#15803d' },
        impediment: { bg: '#ffedd5', color: '#c2410c' },
        incomplete: { bg: '#fef3c7', color: '#a16207' },
        pending:    { bg: '#f1f5f9', color: '#64748b' },
    };
    const s = styleByStatus[status];
    return (
        <span
            className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold"
            style={{ backgroundColor: s.bg, color: s.color }}
        >
            {AUDIT_TASK_STATUS_LABEL[status]}
        </span>
    );
}

interface PrintEvidenceItem {
    task_id: string;
    task_title: string;
    src: string;
    index: number;
    total: number;
}

function Evidences({ tasks }: { tasks: AuditTaskDetail[] }) {
    const items: PrintEvidenceItem[] = [];
    for (const t of tasks) {
        const valid = t.evidences.filter(ev => !!ev.signed_url);
        valid.forEach((ev, i) => {
            items.push({
                task_id: t.task_id,
                task_title: t.title,
                src: ev.signed_url!,
                index: i + 1,
                total: valid.length,
            });
        });
    }
    if (items.length === 0) return null;
    return (
        <section className="mt-7">
            <h2 className="text-base font-bold text-slate-900 mb-3 pb-1 border-b border-slate-300">
                Evidências fotográficas
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {items.map((it, idx) => (
                    <figure key={`${it.task_id}-${idx}`} className="border border-slate-300 rounded p-2">
                        <div className="aspect-square bg-slate-100 overflow-hidden flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={it.src}
                                alt={`Evidência ${it.index} de ${it.task_title}`}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <figcaption className="text-[10px] text-slate-700 mt-1 truncate" title={it.task_title}>
                            {it.task_title}
                            {it.total > 1 && <span className="text-slate-500"> · {it.index}/{it.total}</span>}
                        </figcaption>
                    </figure>
                ))}
            </div>
        </section>
    );
}

// ─── Format helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
}
function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
function formatStars(rating: number): string {
    const filled = Math.max(0, Math.min(5, Math.round(rating)));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}
function formatDuration(seconds: number | null): string {
    if (seconds === null) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return s > 0 ? `${m}min ${s}s` : `${m}min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}min` : `${h}h`;
}
