'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useHistorico, HistoricoEntry, HistoricoFilter, PAGE_SIZE } from '@/lib/hooks/use-historico';
import { useSignedUrl } from '@/lib/hooks/use-signed-url';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (iso: string): { date: string; time: string } => {
    const d = new Date(iso);
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
        .replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
};

const formatVariation = (v: number | null): { label: string; color: string; bg: string } => {
    if (v === null) return { label: 'sem dados', color: 'text-[#92bbc9]', bg: 'bg-slate-700/30' };
    if (v > 0) return { label: `+${v}%`, color: 'text-[#0bda57]', bg: 'bg-[#0bda57]/10' };
    if (v < 0) return { label: `${v}%`, color: 'text-[#fa5f38]', bg: 'bg-[#fa5f38]/10' };
    return { label: '0%', color: 'text-[#92bbc9]', bg: 'bg-slate-700/30' };
};

const CATEGORY_COLOR: Record<string, string> = {
    limpeza: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    cozinha: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    administrativo: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    segurança: 'bg-red-500/10 text-red-400 border border-red-500/20',
    higiene: 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
    abertura: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
    fechamento: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
};

const TASK_ICON_COLOR: Record<string, string> = {
    limpeza: 'bg-[#13b6ec]/20 text-[#13b6ec]',
    cozinha: 'bg-[#fa5f38]/20 text-[#fa5f38]',
    administrativo: 'bg-purple-500/20 text-purple-400',
    segurança: 'bg-red-500/20 text-red-400',
};

function getCategoryStyle(name: string): string {
    const key = name?.toLowerCase().trim();
    return CATEGORY_COLOR[key] || 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
}

function getTaskIconStyle(category: string | null): string {
    const key = category?.toLowerCase().trim() || '';
    return TASK_ICON_COLOR[key] || 'bg-[#13b6ec]/20 text-[#13b6ec]';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonRow() {
    return (
        <tr>
            {[1, 2, 3, 4, 5, 6].map(i => (
                <td key={i} className="px-6 py-4">
                    <div className="h-4 rounded bg-[#233f48] animate-pulse" style={{ width: i === 1 ? '60%' : i === 6 ? '30px' : '50%' }} />
                </td>
            ))}
        </tr>
    );
}

interface PhotoModalProps {
    entry: HistoricoEntry;
    onClose: () => void;
}

function PhotoModal({ entry, onClose }: PhotoModalProps) {
    const photoUrl = useSignedUrl(entry.photo_url);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const { date, time } = formatDate(entry.executed_at);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
            onClick={onClose}
        >
            <div
                className="relative max-w-2xl w-full flex flex-col gap-4"
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute -top-4 right-0 size-9 flex items-center justify-center rounded-full bg-[#1a2c32] border border-[#325a67] text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors z-10"
                    aria-label="Fechar"
                >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>

                {/* Image */}
                <div className="relative w-full rounded-xl overflow-hidden flex items-center justify-center bg-black/40" style={{ maxHeight: '70vh', minHeight: '200px' }}>
                    {photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={photoUrl}
                            alt={entry.checklist_tasks?.title || 'Foto da tarefa'}
                            className="max-w-full max-h-[70vh] object-contain"
                            onError={(e) => { e.currentTarget.src = '/image-error-placeholder.png'; }}
                        />
                    ) : (
                        <span className="material-symbols-outlined animate-spin text-2xl text-[#13b6ec]">progress_activity</span>
                    )}
                </div>

                {/* Caption */}
                <div className="bg-[#16262c] border border-[#325a67] rounded-xl px-5 py-3 flex flex-col gap-1">
                    <p className="text-white font-bold">{entry.checklist_tasks?.title}</p>
                    <p className="text-[#92bbc9] text-sm">{date} • {time}</p>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoricoStaffPage() {
    const router = useRouter();
    const { restaurantId, userRole } = useRestaurantStore();
    const [userId, setUserId] = useState<string | null>(null);

    // ── Filters state ──
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<HistoricoFilter>('all');
    const [date, setDate] = useState('');
    const [photoEntry, setPhotoEntry] = useState<HistoricoEntry | null>(null);

    // ── Auth ──
    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
        if (userRole && userRole !== 'staff') {
            router.replace('/dashboard');
        }
    }, [userRole, router]);

    // Reset page on filter change
    useEffect(() => { setPage(0); }, [search, filter, date]);

    const options = useMemo(() => ({ page, search, filter, date }), [page, search, filter, date]);

    const { entries, total, metrics, isLoading, error } = useHistorico(restaurantId, userId, options);

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const startItem = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const endItem = Math.min((page + 1) * PAGE_SIZE, total);

    const varTotal = formatVariation(metrics.variacaoTotal);

    // ── Chips  ──
    const chips: { label: string; value: HistoricoFilter }[] = [
        { label: 'Todas', value: 'all' },
        { label: 'Verificadas', value: 'done' },
        { label: 'Pendentes', value: 'skipped' },
        { label: 'Rejeitadas', value: 'flagged' },
    ];

    // ── Date input helper (dd/mm/aaaa → YYYY-MM-DD) ──
    const handleDateInput = (raw: string) => {
        const digits = raw.replace(/\D/g, '').slice(0, 8);
        let formatted = digits;
        if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
        else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;

        if (digits.length === 8) {
            const isoDate = `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
            setDate(isoDate);
        } else {
            setDate('');
        }
        return formatted;
    };

    const [dateDisplay, setDateDisplay] = useState('');

    return (
        <div className="p-4 md:p-8 lg:p-10 min-h-full bg-[#101d22] text-white font-sans">
            <div className="max-w-[1200px] mx-auto flex flex-col gap-8">

                {/* ── Page Heading ── */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                        Histórico de Tarefas
                    </h1>
                    <p className="text-[#92bbc9] text-base max-w-2xl">
                        Visualize seu desempenho e filtre suas atividades concluídas recentemente.
                    </p>
                </div>

                {/* ── Error state ── */}
                {error && (
                    <div className="bg-red-500/10 border border-red-900/50 rounded-xl p-6 flex flex-col items-center gap-3 text-center">
                        <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                        <p className="text-red-400 font-medium">Erro ao carregar histórico</p>
                        <p className="text-red-400/70 text-sm">{error.message}</p>
                    </div>
                )}

                {/* ── Metric Cards ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Concluído */}
                    <div className="flex flex-col gap-2 rounded-xl p-5 border border-[#325a67] bg-[#16262c]/50 hover:border-[#13b6ec]/50 transition-colors">
                        <div className="flex items-center justify-between">
                            <p className="text-[#92bbc9] text-xs font-medium uppercase tracking-wider">Total Concluído</p>
                            <span className="material-symbols-outlined text-[#13b6ec]">task_alt</span>
                        </div>
                        <div className="flex items-baseline gap-3 flex-wrap">
                            {isLoading
                                ? <div className="h-9 w-16 rounded bg-[#233f48] animate-pulse" />
                                : <p className="text-white text-3xl font-bold">{metrics.total}</p>
                            }
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${varTotal.color} ${varTotal.bg}`}>
                                {varTotal.label}
                            </span>
                        </div>
                    </div>

                    {/* Aprovadas */}
                    <div className="flex flex-col gap-2 rounded-xl p-5 border border-[#325a67] bg-[#16262c]/50 hover:border-[#13b6ec]/50 transition-colors">
                        <div className="flex items-center justify-between">
                            <p className="text-[#92bbc9] text-xs font-medium uppercase tracking-wider">Aprovadas</p>
                            <span className="material-symbols-outlined text-[#0bda57]">verified</span>
                        </div>
                        <div className="flex items-baseline gap-3 flex-wrap">
                            {isLoading
                                ? <div className="h-9 w-16 rounded bg-[#233f48] animate-pulse" />
                                : <p className="text-white text-3xl font-bold">{metrics.aprovadas}</p>
                            }
                            <span className="text-xs font-medium px-2 py-0.5 rounded text-[#0bda57] bg-[#0bda57]/10">done</span>
                        </div>
                    </div>

                    {/* Pendentes / Puladas */}
                    <div className="flex flex-col gap-2 rounded-xl p-5 border border-[#325a67] bg-[#16262c]/50 hover:border-[#13b6ec]/50 transition-colors">
                        <div className="flex items-center justify-between">
                            <p className="text-[#92bbc9] text-xs font-medium uppercase tracking-wider">Puladas</p>
                            <span className="material-symbols-outlined text-[#fbbf24]">pending</span>
                        </div>
                        <div className="flex items-baseline gap-3 flex-wrap">
                            {isLoading
                                ? <div className="h-9 w-16 rounded bg-[#233f48] animate-pulse" />
                                : <p className="text-white text-3xl font-bold">{metrics.pendentes}</p>
                            }
                        </div>
                    </div>

                    {/* Incidentes */}
                    <div className="flex flex-col gap-2 rounded-xl p-5 border border-[#325a67] bg-[#16262c]/50 hover:border-[#13b6ec]/50 transition-colors">
                        <div className="flex items-center justify-between">
                            <p className="text-[#92bbc9] text-xs font-medium uppercase tracking-wider">Incidentes</p>
                            <span className="material-symbols-outlined text-[#fa5f38]">cancel</span>
                        </div>
                        <div className="flex items-baseline gap-3 flex-wrap">
                            {isLoading
                                ? <div className="h-9 w-16 rounded bg-[#233f48] animate-pulse" />
                                : <p className="text-white text-3xl font-bold">{metrics.incidentes}</p>
                            }
                            <span className="text-xs font-medium px-2 py-0.5 rounded text-[#92bbc9] bg-slate-700/30">
                                {metrics.incidentes === 0 ? '0%' : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Filters Toolbar ── */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-[#16262c] border border-[#325a67] rounded-xl p-4">
                        {/* Inputs */}
                        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-1">
                            {/* Search */}
                            <div className="relative w-full lg:max-w-xs">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#92bbc9] material-symbols-outlined text-[20px]">
                                    search
                                </span>
                                <input
                                    type="text"
                                    placeholder="Pesquisar tarefa..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full bg-[#101d22] border border-[#325a67] rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-[#92bbc9] focus:ring-1 focus:ring-[#13b6ec] focus:border-[#13b6ec] outline-none text-sm transition-all"
                                />
                            </div>

                            {/* Date */}
                            <div className="relative w-full lg:max-w-[210px]">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#92bbc9] material-symbols-outlined text-[20px]">
                                    calendar_today
                                </span>
                                <input
                                    type="text"
                                    placeholder="Data (dd/mm/aaaa)"
                                    value={dateDisplay}
                                    onChange={e => {
                                        const fmt = handleDateInput(e.target.value);
                                        setDateDisplay(fmt);
                                    }}
                                    maxLength={10}
                                    className="w-full bg-[#101d22] border border-[#325a67] rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-[#92bbc9] focus:ring-1 focus:ring-[#13b6ec] focus:border-[#13b6ec] outline-none text-sm transition-all"
                                />
                            </div>
                        </div>

                        {/* Filter chips */}
                        <div className="flex flex-nowrap overflow-x-auto gap-2 w-full lg:w-auto pb-1 lg:pb-0">
                            {chips.map(chip => (
                                <button
                                    key={chip.value}
                                    onClick={() => setFilter(chip.value)}
                                    className={`
                    shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95
                    ${filter === chip.value
                                            ? 'bg-[#13b6ec] text-white shadow-[0_0_15px_rgba(19,182,236,0.3)]'
                                            : 'bg-[#101d22] border border-[#325a67] text-[#92bbc9] hover:text-white hover:border-[#92bbc9]'
                                        }
                  `}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Table ── */}
                <div className="rounded-xl border border-[#325a67] overflow-hidden bg-[#16262c]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-[#92bbc9]">
                            <thead className="bg-[#192d33] text-white text-xs font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4" scope="col">Tarefa</th>
                                    <th className="px-6 py-4" scope="col">Categoria</th>
                                    <th className="px-6 py-4" scope="col">Data de Conclusão</th>
                                    <th className="px-6 py-4" scope="col">Status</th>
                                    <th className="px-6 py-4 text-right" scope="col">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#325a67]">
                                {/* Loading rows */}
                                {isLoading && [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}

                                {/* Entries */}
                                {!isLoading && entries.map(entry => {
                                    const { date: d, time: t } = formatDate(entry.executed_at);
                                    const category = entry.checklists?.category || entry.checklists?.name || '—';
                                    const taskIconStyle = getTaskIconStyle(entry.checklists?.category || null);

                                    return (
                                        <tr key={entry.id} className="group hover:bg-[#101d22]/50 transition-colors">
                                            {/* Task */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-8 w-8 shrink-0 rounded flex items-center justify-center ${taskIconStyle}`}>
                                                        <span className="material-symbols-outlined text-[18px]">
                                                            {entry.status === 'done' ? 'task_alt' : entry.status === 'flagged' ? 'flag' : 'skip_next'}
                                                        </span>
                                                    </div>
                                                    <span className="text-white font-medium text-base">
                                                        {entry.checklist_tasks?.title || '—'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Category */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryStyle(category)}`}>
                                                    {category}
                                                </span>
                                            </td>

                                            {/* Date */}
                                            <td className="px-6 py-4 whitespace-nowrap text-white">
                                                {d}{' '}
                                                <span className="text-[#92bbc9] text-xs ml-1">{t}</span>
                                            </td>

                                            {/* Status */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {entry.status === 'done' && (
                                                    <div className="flex items-center gap-2 text-[#0bda57]">
                                                        <span className="material-symbols-outlined text-[18px]">verified</span>
                                                        <span className="font-medium">Aprovado</span>
                                                    </div>
                                                )}
                                                {entry.status === 'flagged' && (
                                                    <div className="flex items-center gap-2 text-[#fa5f38]">
                                                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                                                        <span className="font-medium">Incidente</span>
                                                    </div>
                                                )}
                                                {entry.status === 'skipped' && (
                                                    <div className="flex items-center gap-2 text-[#fbbf24]">
                                                        <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                                                        <span className="font-medium">Pulada</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                {entry.photo_url ? (
                                                    <button
                                                        onClick={() => setPhotoEntry(entry)}
                                                        className="text-[#92bbc9] hover:text-white p-2 hover:bg-white/5 rounded-full transition-colors"
                                                        title="Ver foto"
                                                    >
                                                        <span className="material-symbols-outlined">visibility</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        disabled
                                                        className="text-[#325a67] p-2 rounded-full cursor-default"
                                                        title="Sem foto"
                                                    >
                                                        <span className="material-symbols-outlined">visibility_off</span>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}

                                {/* Empty state */}
                                {!isLoading && entries.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <span className="material-symbols-outlined text-5xl text-[#325a67]">
                                                    {search ? 'search_off' : 'history_toggle_off'}
                                                </span>
                                                <p className="text-[#92bbc9] font-medium">
                                                    {search
                                                        ? `Nenhuma tarefa encontrada para "${search}"`
                                                        : 'Nenhum registro encontrado.'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="bg-[#192d33] px-6 py-4 border-t border-[#325a67] flex items-center justify-between gap-4">
                        <span className="text-sm text-[#92bbc9] hidden sm:block">
                            Mostrando{' '}
                            <span className="text-white font-medium">{startItem}-{endItem}</span>
                            {' '}de{' '}
                            <span className="text-white font-medium">{total}</span>
                            {' '}tarefas
                        </span>
                        <span className="text-sm text-[#92bbc9] sm:hidden">
                            {page + 1}/{Math.max(totalPages, 1)}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="px-3 py-1.5 rounded bg-[#101d22] border border-[#325a67] text-[#92bbc9] hover:text-white hover:border-[#92bbc9] text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Anterior
                            </button>
                            <button
                                onClick={() => setPage(p => p + 1)}
                                disabled={page >= totalPages - 1 || total === 0}
                                className="px-3 py-1.5 rounded bg-[#101d22] border border-[#325a67] text-[#92bbc9] hover:text-white hover:border-[#92bbc9] text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Próximo
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* ── Photo Modal ── */}
            {photoEntry && (
                <PhotoModal entry={photoEntry} onClose={() => setPhotoEntry(null)} />
            )}
        </div>
    );
}
