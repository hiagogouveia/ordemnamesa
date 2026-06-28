'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { UnitBadge } from '@/components/ui/unit-badge';
import { useRelatorioDetail } from '@/lib/hooks/use-relatorios-detail';
import type { AuditExecutionDetail, AuditIssue, AuditTaskDetail } from '@/lib/types/audit';
import { TASK_ISSUE_STATUS_LABEL } from '@/lib/types/audit';
import type { Scope } from '@/lib/types/scope';
import { StatusBadge } from './status-badge';
import { EvidenceLightbox } from './evidence-lightbox';
import { formatDate, formatDateTime, formatDuration, formatShift } from './format';

interface Props {
    scope: Scope;
    assumptionId: string | null;
    onClose: () => void;
}

export function AuditExecutionPanel({ scope, assumptionId, onClose }: Props) {
    const isOpen = !!assumptionId;
    const { data, isLoading, error } = useRelatorioDetail(scope, assumptionId);
    const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        function onEsc(e: KeyboardEvent) {
            if (e.key === 'Escape' && !lightbox) onClose();
        }
        window.addEventListener('keydown', onEsc);
        return () => {
            window.removeEventListener('keydown', onEsc);
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, onClose, lightbox]);

    if (!isOpen) return null;

    const printHref = assumptionId ? buildPrintHref(scope, assumptionId) : '#';

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <aside
                className="w-full md:max-w-[560px] h-full bg-[#101d22] border-l border-[#325a67] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#233f48] shrink-0">
                    <div className="flex items-center gap-2 text-[#92bbc9]">
                        <span className="material-symbols-outlined">fact_check</span>
                        <span className="text-sm font-bold uppercase tracking-wider">Auditoria da execução</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {data && (
                            <Link
                                href={printHref}
                                target="_blank"
                                rel="noopener"
                                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#325a67] bg-[#16262c] text-[#92bbc9] hover:text-white hover:border-[#13b6ec]/40 text-sm transition-colors"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                                Imprimir / PDF
                            </Link>
                        )}
                        <button
                            onClick={onClose}
                            type="button"
                            aria-label="Fechar"
                            className="size-9 flex items-center justify-center rounded-lg text-[#92bbc9] hover:text-white hover:bg-[#1a2c32] transition-colors"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading && <PanelSkeleton />}
                    {error && (
                        <div className="p-6">
                            <div className="bg-red-500/10 border border-red-900/50 rounded-xl p-5 text-center text-red-400">
                                <p className="font-medium mb-1">Erro ao carregar a execução</p>
                                <p className="text-xs">{error.message}</p>
                            </div>
                        </div>
                    )}
                    {data && (
                        <PanelContent
                            detail={data}
                            onOpenEvidence={(src, title) => setLightbox({ src, title })}
                        />
                    )}
                </div>

                {/* Mobile footer (PDF) */}
                {data && (
                    <div className="sm:hidden border-t border-[#233f48] p-4">
                        <Link
                            href={printHref}
                            target="_blank"
                            rel="noopener"
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#13b6ec] hover:bg-[#0fa3d4] text-white font-bold text-sm transition-colors active:scale-[0.99]"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span>
                            Imprimir / Salvar PDF
                        </Link>
                    </div>
                )}
            </aside>

            {lightbox && (
                <EvidenceLightbox
                    src={lightbox.src}
                    title={lightbox.title}
                    caption={data ? `${data.checklist.name} · ${formatDateTime(data.assumed_at)}` : undefined}
                    onClose={() => setLightbox(null)}
                />
            )}
        </div>,
        document.body,
    );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function buildPrintHref(scope: Scope, id: string): string {
    const sp = new URLSearchParams();
    if (scope.mode === 'global') {
        sp.set('mode', 'global');
        sp.set('account_id', scope.accountId);
    } else {
        sp.set('restaurant_id', scope.restaurantId);
    }
    return `/imprimir/relatorios/${id}?${sp.toString()}`;
}

function PanelSkeleton() {
    return (
        <div className="p-5 flex flex-col gap-4 animate-pulse">
            <div className="h-6 w-2/3 rounded bg-[#233f48]" />
            <div className="h-4 w-1/2 rounded bg-[#233f48]" />
            <div className="grid grid-cols-3 gap-3 mt-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-[#1a2c32]" />)}
            </div>
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 rounded-xl bg-[#1a2c32]" />
            ))}
        </div>
    );
}

function PanelContent({
    detail, onOpenEvidence,
}: {
    detail: AuditExecutionDetail;
    onOpenEvidence: (src: string, title: string) => void;
}) {
    const counts = countTasksByStatus(detail.tasks);
    const hasAnyExecution = detail.tasks.some(t => t.execution_id !== null);
    return (
        <div className="flex flex-col gap-5 p-5">
            {/* ── Cabeçalho ── */}
            <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-white text-xl font-black leading-tight">
                            {detail.checklist.name}
                        </h2>
                        {detail.checklist.description && (
                            <p className="text-[#92bbc9] text-sm mt-1">{detail.checklist.description}</p>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge status={detail.status} />
                        {detail.status === 'completed' && detail.had_impediment && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide text-[#fbbf24] bg-[#fbbf24]/10 border border-[#fbbf24]/20"
                                title="Esta rotina passou por impedimento durante a execução."
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>history</span>
                                Teve impedimento
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {detail.area && (
                        <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                            style={{
                                backgroundColor: `${detail.area.color ?? '#13b6ec'}1a`,
                                borderColor: `${detail.area.color ?? '#13b6ec'}33`,
                                color: detail.area.color ?? '#13b6ec',
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>layers</span>
                            {detail.area.name}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs text-[#92bbc9] bg-[#16262c] border border-[#325a67]">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
                        {formatShift(detail.checklist.shift)}
                    </span>
                    {detail.unit && <UnitBadge name={detail.unit.name} />}
                </div>
            </div>

            {/* ── Meta cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetaCard icon="event" label="Data" value={formatDate(detail.assumed_at)} />
                <MetaCard icon="hourglass_top" label="Duração" value={formatDuration(detail.duration_seconds)} />
                <MetaCard icon="event_available" label="Concluído em"
                    value={detail.completed_at ? formatDateTime(detail.completed_at) : '—'} />
            </div>

            {/* ── Responsável ── */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#16262c] border border-[#325a67]">
                <Avatar src={detail.user.avatar_url} name={detail.user.name} size={40} border="border-[#325a67]" />
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-[#557682] font-bold">Responsável</p>
                    <p className="text-white font-medium truncate">{detail.user.name}</p>
                </div>
            </div>

            {/* ── Resumo de tarefas (oculto quando não há execuções) ── */}
            {hasAnyExecution && (
                <div className="grid grid-cols-3 gap-2">
                    <Tally label="Concluídas" value={counts.completed} color="text-[#0bda57]" />
                    <Tally label="Com impedimento" value={counts.impediment} color="text-[#fa5f38]" />
                    <Tally label="Não executadas" value={counts.incomplete + counts.pending} color="text-[#92bbc9]" />
                </div>
            )}

            {/* ── Ocorrências operacionais (task_issues) ── */}
            {detail.issues.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                        detail.status === 'impediment'
                            ? 'bg-[#fa5f38]/5 border-[#fa5f38]/30'
                            : 'bg-[#fbbf24]/5 border-[#fbbf24]/30'
                    }`}>
                        <span
                            className={`material-symbols-outlined shrink-0 mt-0.5 ${
                                detail.status === 'impediment' ? 'text-[#fa5f38]' : 'text-[#fbbf24]'
                            }`}
                            style={{ fontSize: 20 }}
                        >
                            {detail.status === 'impediment' ? 'report_problem' : 'history'}
                        </span>
                        <div className="min-w-0">
                            {detail.status === 'impediment' ? (
                                <>
                                    <p className="text-white font-medium text-sm">
                                        Esta rotina foi encerrada com ocorrência pendente.
                                    </p>
                                    <p className="text-[#92bbc9] text-xs mt-1">
                                        Há pelo menos uma ocorrência aberta cuja tarefa não foi concluída. Por isso o status é <span className="text-[#fa5f38] font-semibold">Com impedimento</span>.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-white font-medium text-sm">
                                        Esta rotina teve ocorrência durante a execução e foi concluída mesmo assim.
                                    </p>
                                    <p className="text-[#92bbc9] text-xs mt-1">
                                        As tarefas afetadas foram retomadas ou as ocorrências resolvidas. Status final: <span className="text-white font-semibold">Concluída</span>.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <h3 className="text-xs uppercase tracking-wider text-[#557682] font-bold">
                        Ocorrências ({detail.issues.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                        {detail.issues.map(issue => (
                            <IssueCard key={issue.id} issue={issue} onOpenEvidence={onOpenEvidence} />
                        ))}
                    </div>
                </div>
            )}

            {detail.impediment_reason && (
                <div className="p-3 rounded-xl bg-[#fa5f38]/10 border border-[#fa5f38]/30">
                    <p className="text-xs uppercase tracking-wider text-[#fa5f38] font-bold mb-1">
                        Observação registrada na conclusão
                    </p>
                    <p className="text-[#92bbc9] text-sm whitespace-pre-wrap">{detail.impediment_reason}</p>
                </div>
            )}

            {/* ── Lista de tarefas / mensagem auditável ── */}
            <div>
                <h3 className="text-xs uppercase tracking-wider text-[#557682] font-bold mb-3">
                    {hasAnyExecution
                        ? `Itens executados (${detail.tasks.length})`
                        : 'Detalhamento da execução'}
                </h3>
                {!hasAnyExecution && detail.tasks.length > 0 && (
                    <div className="p-4 rounded-xl bg-[#16262c] border border-[#325a67] flex items-start gap-3">
                        <span className="material-symbols-outlined text-[#92bbc9] shrink-0 mt-0.5" style={{ fontSize: 20 }}>
                            description
                        </span>
                        <div className="min-w-0">
                            <p className="text-white font-medium text-sm">
                                Esta rotina foi finalizada sem detalhamento de tarefas.
                            </p>
                            <p className="text-[#92bbc9] text-xs mt-1">
                                A conclusão foi registrada pelo responsável sem marcar cada item individualmente. Status e horários da finalização estão preservados acima.
                            </p>
                        </div>
                    </div>
                )}
                {hasAnyExecution && (
                    <div className="flex flex-col gap-2">
                        {detail.tasks.map(t => (
                            <TaskRow key={t.task_id} task={t} onOpenEvidence={onOpenEvidence} />
                        ))}
                    </div>
                )}
                {detail.tasks.length === 0 && (
                    <p className="text-[#92bbc9] text-sm py-6 text-center">
                        Esta rotina não possui itens cadastrados.
                    </p>
                )}
            </div>
        </div>
    );
}

function MetaCard({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <div className="bg-[#16262c] border border-[#325a67] rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-[#557682]">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
                <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
            </div>
            <p className="text-white text-sm font-semibold truncate">{value}</p>
        </div>
    );
}

function Tally({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="bg-[#101d22] border border-[#233f48] rounded-lg px-2 py-2 text-center">
            <p className={`text-lg font-black leading-none ${color}`}>{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-[#557682] font-bold mt-1">{label}</p>
        </div>
    );
}

function IssueCard({
    issue, onOpenEvidence,
}: {
    issue: AuditIssue;
    onOpenEvidence: (src: string, title: string) => void;
}) {
    const photos = issue.photos.filter(p => !!p.signed_url);
    const accent = issue.is_pending ? '#fa5f38' : '#fbbf24';
    return (
        <div
            className="rounded-xl p-3 flex flex-col gap-2 border"
            style={{ backgroundColor: `${accent}0d`, borderColor: `${accent}4d` }}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{issue.task_title}</p>
                    <p className="text-[#557682] text-[10px] mt-0.5">
                        Reportado por {issue.reporter_name} · {formatDateTime(issue.created_at)}
                    </p>
                </div>
                <span
                    className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border"
                    style={{ color: accent, borderColor: `${accent}4d`, backgroundColor: `${accent}1a` }}
                >
                    {issue.is_pending ? 'Pendente' : TASK_ISSUE_STATUS_LABEL[issue.status]}
                </span>
            </div>

            <p className="text-[#92bbc9] text-sm whitespace-pre-wrap">{issue.description}</p>

            {issue.manager_comment && (
                <div className="bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#557682] font-bold mb-0.5">
                        Comentário do gestor
                    </p>
                    <p className="text-[#92bbc9] text-sm whitespace-pre-wrap">{issue.manager_comment}</p>
                </div>
            )}

            {photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {photos.map((ph, i) => (
                        <button
                            key={ph.storage_path}
                            type="button"
                            onClick={() => onOpenEvidence(ph.signed_url!, issue.task_title)}
                            className="size-14 rounded overflow-hidden bg-black/30 border border-[#325a67] hover:border-[#13b6ec]/50 transition-colors"
                            title={`Evidência ${i + 1}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={ph.signed_url!}
                                alt={`Evidência ${i + 1} da ocorrência`}
                                className="w-full h-full object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function TaskRow({
    task, onOpenEvidence,
}: {
    task: AuditTaskDetail;
    onOpenEvidence: (src: string, title: string) => void;
}) {
    const evidences = task.evidences.filter(ev => !!ev.signed_url);
    const hasEvidence = evidences.length > 0;
    const wasExecuted = !!task.execution_id;

    return (
        <div className="bg-[#16262c] border border-[#325a67] rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-start gap-3">
                <StatusBadge status={task.status} iconOnly />
                <div className="flex-1 min-w-0">
                    <p className="text-white font-medium leading-snug flex items-center gap-1.5">
                        {task.title}
                        {task.is_critical && (
                            <span
                                className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-red-400"
                                title="Tarefa crítica"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>priority_high</span>
                            </span>
                        )}
                    </p>
                    {task.description && (
                        <p className="text-[#92bbc9] text-xs mt-0.5 whitespace-pre-wrap">{task.description}</p>
                    )}
                </div>
                {wasExecuted && task.executed_at && (
                    <span className="text-[#557682] text-xs whitespace-nowrap shrink-0">
                        {formatDateTime(task.executed_at).split(' ')[1]}
                    </span>
                )}
            </div>

            {task.observation && (
                <div className="bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#557682] font-bold mb-0.5">Observação</p>
                    <p className="text-[#92bbc9] text-sm whitespace-pre-wrap">{task.observation}</p>
                </div>
            )}

            {task.impediment_reason && (
                <div className="bg-[#fa5f38]/10 border border-[#fa5f38]/30 rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#fa5f38] font-bold mb-0.5">Impedimento</p>
                    <p className="text-[#92bbc9] text-sm whitespace-pre-wrap">{task.impediment_reason}</p>
                </div>
            )}

            {hasEvidence && (
                <div className="flex flex-wrap gap-2">
                    {evidences.map((ev, i) => (
                        <button
                            key={ev.storage_path}
                            type="button"
                            onClick={() => onOpenEvidence(ev.signed_url!, task.title)}
                            className="group flex items-center gap-2 px-2 py-1 rounded-lg border border-[#325a67] bg-[#101d22] hover:border-[#13b6ec]/40 transition-colors"
                            title={`Evidência ${i + 1}`}
                        >
                            <span className="size-10 rounded overflow-hidden bg-black/30 flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={ev.signed_url!}
                                    alt={`Evidência ${i + 1} de ${task.title}`}
                                    className="w-full h-full object-cover"
                                />
                            </span>
                            <span className="flex items-center gap-1 text-xs text-[#92bbc9] group-hover:text-white transition-colors">
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>image</span>
                                {evidences.length > 1 ? `Evidência ${i + 1}` : 'Ver evidência'}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {wasExecuted && !hasEvidence && task.is_critical && (
                <span className="self-start inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-[#fbbf24] bg-[#fbbf24]/10 border border-[#fbbf24]/20 px-2 py-0.5 rounded-full">
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>image_not_supported</span>
                    Sem evidência
                </span>
            )}
        </div>
    );
}

function countTasksByStatus(tasks: AuditTaskDetail[]) {
    const c = { completed: 0, impediment: 0, incomplete: 0, pending: 0 };
    for (const t of tasks) {
        if (t.status === 'completed') c.completed++;
        else if (t.status === 'impediment') c.impediment++;
        else if (t.status === 'pending') c.pending++;
        else c.incomplete++;
    }
    return c;
}
