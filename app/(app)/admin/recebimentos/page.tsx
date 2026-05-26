'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import {
    useReceivingExpectations,
    useReceivingCounts,
    useConfirmExpectation,
    useCancelExpectation,
    useMarkOverdue,
    useQuickReceivingHistory,
    type ReceivingExpectationWithChecklist,
    type QuickReceivingStatusFilter,
} from '@/lib/hooks/use-receiving';

type Tab = 'pending' | 'overdue' | 'confirmed' | 'cancelled' | 'quick';

const TAB_META: Record<Tab, { label: string; statusParam: string; emptyHint: string }> = {
    pending:   { label: 'Pendentes',   statusParam: 'pending',   emptyHint: 'Nenhum recebimento aguardando confirmação.' },
    overdue:   { label: 'Previsão passou', statusParam: 'overdue', emptyHint: 'Nenhum recebimento com previsão passada.' },
    confirmed: { label: 'Confirmados', statusParam: 'confirmed', emptyHint: 'Nenhum recebimento confirmado para hoje.' },
    cancelled: { label: 'Cancelados',  statusParam: 'cancelled', emptyHint: 'Nenhum recebimento cancelado hoje.' },
    quick:     { label: 'Rápidos',     statusParam: '',          emptyHint: 'Nenhum recebimento rápido nos últimos 30 dias.' },
};

function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminRecebimentosPage() {
    const router = useRouter();
    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const [tab, setTab] = useState<Tab>('pending');
    const [cancelTarget, setCancelTarget] = useState<ReceivingExpectationWithChecklist | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [quickStatus, setQuickStatus] = useState<QuickReceivingStatusFilter>('all');

    // Expectations alimentam as 4 abas legacy. A aba 'quick' tem fonte própria.
    const { data: list = [], isLoading } = useReceivingExpectations(
        restaurantId || undefined,
        { status: TAB_META[tab].statusParam || 'pending' },
    );
    const { data: quickList = [], isLoading: isLoadingQuick } = useQuickReceivingHistory(
        tab === 'quick' ? restaurantId || undefined : undefined,
        { days: 30, status: quickStatus },
    );
    const { data: counts } = useReceivingCounts(restaurantId || undefined);

    const confirmM = useConfirmExpectation();
    const cancelM = useCancelExpectation();
    const sweepM = useMarkOverdue();

    // Ao abrir a tela ou trocar para a aba Atrasados, recalcular overdue
    // (idempotente — não duplica notification).
    useEffect(() => {
        if (!restaurantId) return;
        if (tab === 'overdue' || tab === 'pending') {
            sweepM.mutate({ restaurant_id: restaurantId });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, tab]);

    const handleConfirm = async (exp: ReceivingExpectationWithChecklist) => {
        if (!restaurantId) return;
        try { await confirmM.mutateAsync({ id: exp.id, restaurant_id: restaurantId }); }
        catch (e) { console.error(e); }
    };

    const openCancel = (exp: ReceivingExpectationWithChecklist) => {
        setCancelTarget(exp);
        setCancelReason('');
    };

    const handleCancelSubmit = async () => {
        if (!restaurantId || !cancelTarget) return;
        try {
            await cancelM.mutateAsync({
                id: cancelTarget.id,
                restaurant_id: restaurantId,
                reason: cancelReason.trim() || undefined,
            });
            setCancelTarget(null);
            setCancelReason('');
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="min-h-full bg-[#101d22] pb-12">
            <header className="sticky top-0 z-20 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48]">
                <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-amber-400 text-xl">📦</span>
                        <div>
                            <h1 className="text-white font-bold text-lg leading-tight">Recebimentos</h1>
                            <p className="text-[#92bbc9] text-xs">Painel operacional de recebimentos esperados.</p>
                        </div>
                    </div>
                    <nav className="flex gap-1 overflow-x-auto scrollbar-hide">
                        {(Object.keys(TAB_META) as Tab[]).map((t) => {
                            const n = counts?.[t] ?? 0;
                            const isActive = tab === t;
                            const isOverdueTab = t === 'overdue' && n > 0;
                            return (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 ${
                                        isActive
                                            ? 'bg-[#13b6ec] text-[#0f1b21]'
                                            : isOverdueTab
                                                ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                                                : 'bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]'
                                    }`}
                                >
                                    <span>{TAB_META[t].label}</span>
                                    {n > 0 && (
                                        <span className={`text-[10px] font-bold rounded-full px-1.5 ${
                                            isActive ? 'bg-[#0f1b21]/30' : 'bg-[#101d22] border border-current'
                                        }`}>
                                            {n}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-5 flex flex-col gap-3">
                {tab === 'quick' && (
                    <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[#92bbc9] text-xs mr-1">Filtrar:</span>
                        {(['all', 'in_progress', 'completed'] as QuickReceivingStatusFilter[]).map((s) => {
                            const label = s === 'all' ? 'Todos' : s === 'in_progress' ? 'Em execução' : 'Concluídos';
                            const isActive = quickStatus === s;
                            return (
                                <button
                                    key={s}
                                    onClick={() => setQuickStatus(s)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                                        isActive
                                            ? 'bg-[#13b6ec]/15 border border-[#13b6ec]/40 text-[#13b6ec]'
                                            : 'bg-[#182a32] text-[#92bbc9] border border-[#233f48] hover:bg-[#233f48]'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                        <span className="ml-auto text-[#5a8a99] text-[11px]">Últimos 30 dias</span>
                    </div>
                )}

                {tab === 'quick' ? (
                    isLoadingQuick ? (
                        <div className="text-[#92bbc9] text-sm">Carregando…</div>
                    ) : quickList.length === 0 ? (
                        <div className="bg-[#1a2c32] border border-dashed border-[#233f48] rounded-xl p-6 text-center text-[#92bbc9] text-sm">
                            {TAB_META[tab].emptyHint}
                        </div>
                    ) : (
                        quickList.map((q) => {
                            const isCompleted = q.completed_at !== null;
                            return (
                                <article
                                    key={q.checklist_id}
                                    className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-4 flex flex-col gap-3"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-white font-bold text-sm truncate">{q.name}</h3>
                                                <span
                                                    className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider"
                                                    title="Recebimento criado ad-hoc"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">bolt</span>
                                                    Rápido
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#92bbc9] mt-1">
                                                <span>{q.supplier_name || 'Fornecedor não informado'}</span>
                                                {q.area && (
                                                    <span className="flex items-center gap-1">
                                                        • <span className="size-2 rounded-full" style={{ background: q.area.color }} />
                                                        {q.area.name}
                                                    </span>
                                                )}
                                                {q.assumed_by_user_name && (
                                                    <span>• Executado por {q.assumed_by_user_name}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5a8a99] mt-1">
                                                <span>Criado: {formatDateTime(q.created_at)}</span>
                                                {q.assumed_at && <span>• Iniciado: {formatDateTime(q.assumed_at)}</span>}
                                                {q.completed_at && <span>• Concluído: {formatDateTime(q.completed_at)}</span>}
                                                <span>• {q.tasks_completed}/{q.tasks_total} tarefas</span>
                                            </div>
                                        </div>
                                        <span className={`shrink-0 px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
                                            isCompleted
                                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                                                : 'bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]'
                                        }`}>
                                            {isCompleted ? 'Concluído' : 'Em execução'}
                                        </span>
                                    </div>
                                    <div>
                                        <button
                                            onClick={() => router.push(`/turno/atividade/${q.checklist_id}`)}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#16262c] border border-[#233f48] text-[#92bbc9] text-xs font-bold hover:bg-[#233f48] hover:text-white transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                                            Ver detalhes
                                        </button>
                                    </div>
                                </article>
                            );
                        })
                    )
                ) : isLoading ? (
                    <div className="text-[#92bbc9] text-sm">Carregando…</div>
                ) : list.length === 0 ? (
                    <div className="bg-[#1a2c32] border border-dashed border-[#233f48] rounded-xl p-6 text-center text-[#92bbc9] text-sm">
                        {TAB_META[tab].emptyHint}
                    </div>
                ) : (
                    list.map((exp) => {
                        const cl = exp.checklist;
                        const window = exp.expected_window_start && exp.expected_window_end
                            ? `${exp.expected_window_start.slice(0,5)}–${exp.expected_window_end.slice(0,5)}`
                            : null;
                        return (
                            <article
                                key={exp.id}
                                className={`bg-[#1a2c32] border rounded-xl p-4 flex flex-col gap-3 ${
                                    tab === 'overdue' ? 'border-amber-500/40' : 'border-[#233f48]'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="text-white font-bold text-sm truncate">{cl?.name ?? 'Recebimento'}</h3>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#92bbc9] mt-1">
                                            <span>{cl?.supplier_name || 'Fornecedor não informado'}</span>
                                            {window && <span>• {window}</span>}
                                            {cl?.area && (
                                                <span className="flex items-center gap-1">
                                                    • <span className="size-2 rounded-full" style={{ background: cl.area.color }} />
                                                    {cl.area.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <StatusBadge status={exp.status} />
                                </div>

                                {exp.cancelled_reason && tab === 'cancelled' && (
                                    <p className="text-xs text-[#92bbc9] italic bg-[#101d22] rounded-lg p-2 border border-[#233f48]">
                                        Motivo: {exp.cancelled_reason}
                                    </p>
                                )}

                                {(tab === 'pending' || tab === 'overdue') && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => handleConfirm(exp)}
                                            disabled={confirmM.isPending}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#13b6ec] text-[#0f1b21] text-xs font-bold disabled:opacity-60 hover:bg-[#10a1d4] transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">check</span>
                                            {tab === 'overdue' ? 'Confirmar mesmo assim' : 'Confirmar'}
                                        </button>
                                        <button
                                            onClick={() => openCancel(exp)}
                                            disabled={cancelM.isPending}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#16262c] border border-[#233f48] text-[#92bbc9] text-xs font-bold hover:bg-[#233f48] transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                            Cancelar
                                        </button>
                                        {tab === 'overdue' && (
                                            <span
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#16262c] border border-amber-500/30 text-amber-400 text-xs font-medium opacity-70"
                                                title="Placeholder — sem modelagem ainda"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                                Fornecedor atrasou
                                            </span>
                                        )}
                                    </div>
                                )}
                            </article>
                        );
                    })
                )}
            </main>

            {cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCancelTarget(null)}>
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-5 w-full max-w-[420px] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base">Cancelar recebimento</h3>
                        <p className="text-[#92bbc9] text-xs">
                            <strong className="text-white">{cancelTarget.checklist?.name}</strong> — informe um motivo (opcional).
                        </p>
                        <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            rows={3}
                            placeholder="Ex: Fornecedor cancelou a entrega."
                            className="bg-[#101d22] border border-[#233f48] rounded-xl p-3 text-white text-sm focus:border-[#13b6ec] focus:outline-none resize-none"
                            autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setCancelTarget(null)} className="px-3 py-2 rounded-lg bg-[#16262c] border border-[#233f48] text-[#92bbc9] text-sm font-bold">Voltar</button>
                            <button
                                onClick={handleCancelSubmit}
                                disabled={cancelM.isPending}
                                className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-bold disabled:opacity-60 hover:bg-red-500/30 transition-colors"
                            >
                                Cancelar recebimento
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        pending:   { label: 'Pendente',   cls: 'bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]' },
        confirmed: { label: 'Confirmado', cls: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' },
        overdue:   { label: 'Previsão passou', cls: 'bg-amber-500/10 border-amber-500/40 text-amber-400' },
        cancelled: { label: 'Cancelado',  cls: 'bg-[#16262c] border-[#233f48] text-[#92bbc9]' },
    };
    const m = map[status] ?? map.pending;
    return (
        <span className={`shrink-0 px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>
            {m.label}
        </span>
    );
}
