"use client";

import { useEffect, useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/providers/use-session';
import { useAccountSessionStore } from '@/lib/store/account-session-store';
import { useDashboard, type TarefaCriticaTipo, type EquipeMembroStatus } from '@/lib/hooks/use-dashboard';
import { UnitBadge } from '@/components/ui/unit-badge';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';
import type { Scope } from '@/lib/types/scope';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
    return (
        <div className="flex-1 flex flex-col min-w-0 bg-[#101d22] animate-pulse">
            <div className="h-16 px-6 border-b border-[#233f48] flex items-center gap-4">
                <div className="h-5 w-40 rounded bg-[#233f48]" />
            </div>
            <main className="flex-1 p-4 md:p-6">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] flex flex-col gap-3">
                                <div className="h-3 w-24 rounded bg-[#233f48]" />
                                <div className="h-9 w-20 rounded bg-[#233f48]" />
                                <div className="h-1.5 w-full rounded-full bg-[#233f48]" />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className="xl:col-span-2 flex flex-col gap-6">
                            <div className="bg-[#1a2c32] rounded-xl p-6 border border-[#233f48] h-64" />
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="p-4 border-b border-[#233f48] flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-[#233f48] shrink-0" />
                                        <div className="flex-1 flex flex-col gap-2">
                                            <div className="h-3 w-1/3 rounded bg-[#233f48]" />
                                            <div className="h-2 w-full rounded-full bg-[#233f48]" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="xl:col-span-1 flex flex-col gap-6">
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] h-64" />
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] p-5 flex flex-col gap-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="size-10 rounded-full bg-[#233f48] shrink-0" />
                                        <div className="flex-1 flex flex-col gap-2">
                                            <div className="h-3 w-28 rounded bg-[#233f48]" />
                                            <div className="h-2 w-16 rounded bg-[#233f48]" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: TarefaCriticaTipo }) {
    const config: Record<TarefaCriticaTipo, { label: string; className: string }> = {
        bloqueado:        { label: 'Bloqueado',   className: 'bg-red-500/20 text-red-400 border-red-500/30' },
        critico_atrasado: { label: 'Crítico',      className: 'bg-red-500/20 text-red-400 border-red-500/30' },
        critico_pendente: { label: 'Crítico',      className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
        atrasado:         { label: 'Atrasado',     className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    };
    const { label, className } = config[tipo];
    return (
        <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${className}`}>
            {label}
        </span>
    );
}

function StatusDot({ status }: { status: EquipeMembroStatus }) {
    const config: Record<EquipeMembroStatus, { color: string; label: string }> = {
        em_andamento: { color: 'bg-primary',      label: 'Em andamento' },
        concluiu:     { color: 'bg-[#0bda57]',    label: 'Concluiu' },
        atrasado:     { color: 'bg-yellow-400',   label: 'Atrasado' },
        impedimento:  { color: 'bg-red-400',      label: 'Impedimento' },
    };
    const { color, label } = config[status];
    return (
        <span title={label} className={`shrink-0 size-2 rounded-full ${color}`} />
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const router = useRouter();
    const session = useSession();
    const { userRole, restaurantId } = session;
    const restaurantName = session.restaurant?.name ?? null;

    const accountMode = useAccountSessionStore((s) => s.mode);
    const accountId = useAccountSessionStore((s) => s.accountId);
    const accountName = useAccountSessionStore((s) => s.accountName);
    const isGlobal = accountMode === 'global';

    const scope: Scope | null = useMemo(() => {
        if (isGlobal && accountId) return { mode: 'global', accountId };
        if (restaurantId) return { mode: 'single', restaurantId };
        return null;
    }, [isGlobal, accountId, restaurantId]);

    const { data: dashboardData, isLoading, error, refetch, isFetching } = useDashboard(scope);

    const [searchQuery, setSearchQuery] = useState('');

    const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

    const normalize = (text: string) => text.toLowerCase().trim();

    const filteredAreas = useMemo(() => {
        if (!searchQuery) return dashboardData?.area_progresso || [];
        const q = normalize(searchQuery);
        return (dashboardData?.area_progresso || []).filter(a => normalize(a.area_name).includes(q));
    }, [dashboardData?.area_progresso, searchQuery]);

    const sortedAreas = useMemo(() => {
        return [...filteredAreas].sort((a, b) => {
            if (a.area_name === 'Sem área') return 1;
            if (b.area_name === 'Sem área') return -1;
            const pendingDiff = b.pending - a.pending;
            if (pendingDiff !== 0) return pendingDiff;
            return b.total - a.total;
        });
    }, [filteredAreas]);

    useEffect(() => {
        if (userRole === 'staff') {
            router.replace('/turno');
        }
    }, [userRole, router]);

    if ((!userRole && !isGlobal) || userRole === 'staff' || isLoading) {
        return <DashboardSkeleton />;
    }

    if (error) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-[#101d22] gap-4">
                <span className="material-symbols-outlined text-red-500 text-6xl">error</span>
                <p className="text-white">Ocorreu um erro ao carregar os dados do painel.</p>
                <button onClick={() => window.location.reload()} className="bg-primary px-4 py-2 rounded-lg text-black font-bold">Tentar novamente</button>
            </div>
        );
    }

    const {
        conclusao_diaria_percent = 0,
        conclusao_diaria_diff = 0,
        alertas_abertos = 0,
        alertas_abertos_diff = 0,
        equipe_ativa = 0,
        equipe_ativa_diff = 0,
        equipe_detalhes = [],
        tempo_conclusao_mins = 0,
        tempo_conclusao_diff_mins = 0,
        tempo_conclusao_outliers = 0,
        tendencias = [],
        area_progresso = [],
        alertas_recentes = [],
        tarefas_criticas = [],
        top_performers = [],
    } = dashboardData || {};

    const todayDateStr = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date());
    const formattedDate = todayDateStr.charAt(0).toUpperCase() + todayDateStr.slice(1);

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark">
            {/* ── Header ────────────────────────────────────────────────── */}
            <header className="flex items-center justify-between h-16 px-6 border-b border-[#233f48] bg-surface-dark/50 backdrop-blur-sm sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-white text-lg font-bold leading-tight">
                            {isGlobal ? 'Visão Global' : 'Visão Geral Hoje'}
                        </h2>
                        <p className="text-[#92bbc9] text-xs capitalize">
                            {formattedDate} • {isGlobal ? (accountName || 'Todas as Unidades') : (restaurantName || 'Matriz')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center bg-[#233f48] rounded-lg h-10 w-64 px-3 border border-transparent focus-within:border-primary transition-all">
                        <span className="material-symbols-outlined text-[#92bbc9]">search</span>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none text-white text-sm w-full focus:ring-0 placeholder-[#92bbc9]"
                            placeholder="Buscar área..."
                            type="text"
                        />
                    </div>
                    {/* Botão refresh manual */}
                    <button
                        onClick={handleRefresh}
                        title="Atualizar dashboard"
                        className={`flex items-center justify-center size-10 rounded-lg bg-[#233f48] hover:bg-[#2f505a] text-white transition-colors ${isFetching ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                        <span className={`material-symbols-outlined text-sm ${isFetching ? 'animate-spin' : ''}`}>refresh</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">

                    {/* ── Bloco Tarefas Críticas (condicional) ──────────── */}
                    {tarefas_criticas.length > 0 && (
                        <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-red-400">crisis_alert</span>
                                <h3 className="text-white font-bold text-sm">Atenção Agora</h3>
                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                    {tarefas_criticas.length}
                                </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {tarefas_criticas.slice(0, 5).map(item => (
                                    <Link
                                        key={item.id}
                                        href={`/checklists?assumption_id=${item.id}&status=${item.tipo}`}
                                        className="flex items-center gap-3 p-2 hover:bg-red-500/10 rounded-lg transition-colors group"
                                    >
                                        <TipoBadge tipo={item.tipo} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-white text-sm font-medium truncate">{item.checklist_nome}</p>
                                                {item.unit && <UnitBadge name={item.unit.name} />}
                                            </div>
                                            <p className="text-[#92bbc9] text-xs">{item.responsavel_nome} • {item.tempo_atraso}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-[#92bbc9] text-sm opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                                    </Link>
                                ))}
                                {tarefas_criticas.length > 5 && (
                                    <Link href="/checklists?status=blocked" className="text-center text-xs text-red-400 hover:text-red-300 py-2 font-medium">
                                        + {tarefas_criticas.length - 5} itens a mais
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── 4 KPI Cards ───────────────────────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                        {/* Conclusão Diária */}
                        <div className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl text-primary">check_circle</span>
                            </div>
                            <div className="flex flex-col gap-1 relative z-10">
                                <p className="text-[#92bbc9] text-sm font-medium">Conclusão Diária</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-white text-3xl font-bold">{conclusao_diaria_percent}%</h3>
                                    {conclusao_diaria_diff !== 0 && (
                                        <span className={`text-sm font-medium flex items-center px-1.5 py-0.5 rounded ${conclusao_diaria_diff > 0 ? 'text-[#0bda57] bg-[#0bda57]/10' : 'text-red-400 bg-red-400/10'}`}>
                                            <span className="material-symbols-outlined text-sm mr-0.5">
                                                {conclusao_diaria_diff > 0 ? 'trending_up' : 'trending_down'}
                                            </span>
                                            {conclusao_diaria_diff > 0 ? '+' : ''}{conclusao_diaria_diff}%
                                        </span>
                                    )}
                                </div>
                                <div className="w-full bg-[#233f48] h-1.5 rounded-full mt-3">
                                    <div className="bg-primary h-1.5 rounded-full transition-all duration-1000" style={{ width: `${conclusao_diaria_percent}%` }} />
                                </div>
                            </div>
                        </div>

                        {/* Alertas Abertos */}
                        <Link href="/checklists?status=blocked" className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] relative overflow-hidden group block hover:border-red-900/50 transition-colors">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl text-red-400">warning</span>
                            </div>
                            <div className="flex flex-col gap-1 relative z-10">
                                <p className="text-[#92bbc9] text-sm font-medium">Alertas Abertos</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-white text-3xl font-bold">{alertas_abertos}</h3>
                                    {alertas_abertos_diff > 0 && (
                                        <span className="text-red-400 text-sm font-medium flex items-center bg-red-400/10 px-1.5 py-0.5 rounded">
                                            <span className="material-symbols-outlined text-sm mr-0.5">trending_up</span>
                                            +{alertas_abertos_diff}
                                        </span>
                                    )}
                                </div>
                                {alertas_abertos > 0 ? (
                                    <div className="flex gap-1.5 mt-3 flex-wrap">
                                        {tarefas_criticas.slice(0, 3).map((item, i) => (
                                            <TipoBadge key={i} tipo={item.tipo} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs mt-3 text-[#92bbc9]">Tudo certo no turno</p>
                                )}
                            </div>
                        </Link>

                        {/* Equipe Ativa */}
                        <Link href="/equipe" className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] relative overflow-hidden group block hover:border-primary/30 transition-colors">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl text-primary">groups</span>
                            </div>
                            <div className="flex flex-col gap-1 relative z-10">
                                <p className="text-[#92bbc9] text-sm font-medium">Equipe Ativa</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-white text-3xl font-bold">{equipe_ativa}</h3>
                                    <span className="text-[#92bbc9] text-sm font-medium bg-[#92bbc9]/10 px-1.5 py-0.5 rounded">
                                        {equipe_ativa_diff === 0 ? 'hoje' : (equipe_ativa_diff > 0 ? `+${equipe_ativa_diff} hoje` : `${equipe_ativa_diff} hoje`)}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 mt-3">
                                    {equipe_detalhes.slice(0, 3).map(u => (
                                        <div key={u.user_id} className="flex items-center gap-2">
                                            <Avatar src={u.avatar} name={u.nome} size={18} className="shrink-0 text-[7px]" />
                                            <span className="text-[#92bbc9] text-xs truncate flex-1">{u.nome}</span>
                                            <StatusDot status={u.status} />
                                        </div>
                                    ))}
                                    {equipe_ativa > 3 && (
                                        <p className="text-[#557682] text-[10px]">+{equipe_ativa - 3} outros</p>
                                    )}
                                    {equipe_ativa === 0 && <span className="text-xs text-[#92bbc9]">Sem atividade hoje</span>}
                                </div>
                            </div>
                        </Link>

                        {/* Tempo Médio de Conclusão */}
                        <div className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl text-primary">timelapse</span>
                            </div>
                            <div className="flex flex-col gap-1 relative z-10">
                                <p className="text-[#92bbc9] text-sm font-medium">Tempo Médio de Conclusão</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-white text-3xl font-bold">
                                        {tempo_conclusao_mins > 0 ? `${tempo_conclusao_mins}m` : '—'}
                                    </h3>
                                    {tempo_conclusao_diff_mins !== 0 && tempo_conclusao_mins > 0 && (
                                        <span className={`text-sm font-medium flex items-center px-1.5 py-0.5 rounded ${tempo_conclusao_diff_mins < 0 ? 'text-[#0bda57] bg-[#0bda57]/10' : 'text-red-400 bg-red-400/10'}`}>
                                            <span className="material-symbols-outlined text-sm mr-0.5">
                                                {tempo_conclusao_diff_mins < 0 ? 'trending_down' : 'trending_up'}
                                            </span>
                                            {tempo_conclusao_diff_mins < 0 ? tempo_conclusao_diff_mins : `+${tempo_conclusao_diff_mins}`}m
                                        </span>
                                    )}
                                </div>
                                <p className={`text-xs mt-3 ${tempo_conclusao_diff_mins < 0 ? 'text-[#0bda57]' : (tempo_conclusao_diff_mins > 0 ? 'text-red-400' : 'text-[#92bbc9]')}`}>
                                    {tempo_conclusao_mins === 0
                                        ? 'Nenhuma rotina concluída hoje'
                                        : tempo_conclusao_diff_mins < 0
                                            ? 'Mais rápido que ontem'
                                            : tempo_conclusao_diff_mins > 0
                                                ? 'Mais lento que ontem'
                                                : 'Igual a ontem'
                                    }
                                    {tempo_conclusao_outliers > 0 && (
                                        <span className="ml-1 text-[#557682]" title={`${tempo_conclusao_outliers} rotinas com tempo acima de 4h (ignoradas na média)`}>
                                            ({tempo_conclusao_outliers} outlier{tempo_conclusao_outliers > 1 ? 's' : ''})
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ── Breakdown por Unidade (apenas global) ────────── */}
                    {isGlobal && dashboardData?.units_breakdown && dashboardData.units_breakdown.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {dashboardData.units_breakdown.map((ub) => (
                                <div key={ub.unit.id} className="bg-[#1a2c32] rounded-xl p-4 border border-[#233f48] flex flex-col gap-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <UnitBadge name={ub.unit.name} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[#92bbc9] text-xs">Conclusão</span>
                                        <span className="text-white text-sm font-bold">{ub.conclusao_diaria_percent}%</span>
                                    </div>
                                    <div className="w-full bg-[#233f48] h-1.5 rounded-full">
                                        <div
                                            className="bg-primary h-1.5 rounded-full transition-all duration-700"
                                            style={{ width: `${ub.conclusao_diaria_percent}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-xs mt-1">
                                        <span className="text-[#92bbc9]">
                                            <span className="material-symbols-outlined text-[12px] align-middle mr-0.5">warning</span>
                                            {ub.alertas_abertos} alerta{ub.alertas_abertos !== 1 ? 's' : ''}
                                        </span>
                                        <span className="text-[#92bbc9]">
                                            <span className="material-symbols-outlined text-[12px] align-middle mr-0.5">group</span>
                                            {ub.equipe_ativa} ativo{ub.equipe_ativa !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Grid principal ────────────────────────────────── */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full">

                        {/* Coluna Esquerda */}
                        <div className="xl:col-span-2 flex flex-col gap-6">

                            {/* Tendências de Execução */}
                            <div className="bg-[#1a2c32] rounded-xl p-6 border border-[#233f48]">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                    <div>
                                        <h3 className="text-white text-lg font-bold">Tendências de Execução</h3>
                                        <p className="text-[#92bbc9] text-sm">Taxa de conclusão nos últimos 7 dias</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center gap-1.5 text-[#92bbc9] text-xs">
                                            <span className="inline-block w-4 border-t border-dashed border-yellow-500/70" />
                                            Meta 90%
                                        </span>
                                        <div className="flex bg-[#111e22] rounded-lg p-1 border border-[#233f48]">
                                            <button className="px-3 py-1 text-xs font-medium text-white bg-[#233f48] rounded shadow-sm">Diário</button>
                                            <button className="px-3 py-1 text-xs font-medium text-[#92bbc9] hover:text-white transition-colors">Semanal</button>
                                            <button className="px-3 py-1 text-xs font-medium text-[#92bbc9] hover:text-white transition-colors">Mensal</button>
                                        </div>
                                    </div>
                                </div>
                                <div className="relative h-64 w-full flex items-end justify-between gap-2 sm:gap-4 px-2">
                                    {/* Linha de meta 90% */}
                                    <div
                                        className="absolute left-0 right-0 border-t border-dashed border-yellow-500/40 pointer-events-none"
                                        style={{ bottom: '90%' }}
                                    >
                                        <span className="absolute right-0 -top-4 text-yellow-500/60 text-[10px] font-medium">90%</span>
                                    </div>
                                    {tendencias.length > 0 ? tendencias.map((tendencia, i) => {
                                        const isToday = i === tendencias.length - 1;
                                        const belowMeta = tendencia.percent < 90 && tendencia.percent > 0;
                                        return (
                                            <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full justify-end group cursor-pointer">
                                                <div
                                                    className={`relative w-full max-w-[40px] rounded-t-lg transition-all ${
                                                        isToday
                                                            ? 'bg-primary shadow-[0_0_15px_rgba(19,182,236,0.3)]'
                                                            : belowMeta
                                                                ? 'bg-red-500/60 group-hover:bg-red-500/80'
                                                                : 'bg-[#233f48] group-hover:bg-primary/50'
                                                    }`}
                                                    style={{ height: `${tendencia.percent > 0 ? tendencia.percent : 4}%` }}
                                                >
                                                    {/* Tooltip */}
                                                    <div className={`absolute -top-8 left-1/2 -translate-x-1/2 bg-[#111e22] text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-[#233f48] z-10 transition-opacity ${isToday ? 'opacity-100 font-bold' : 'opacity-0 group-hover:opacity-100'}`}>
                                                        {tendencia.percent}%
                                                    </div>
                                                </div>
                                                <span className={`text-xs ${isToday ? 'text-white font-bold' : belowMeta ? 'text-red-400' : 'text-[#92bbc9]'}`}>
                                                    {tendencia.date_label}
                                                </span>
                                            </div>
                                        );
                                    }) : (
                                        <div className="flex items-center justify-center w-full h-full text-[#92bbc9]">
                                            <p>Carregando gráfico...</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Progresso por Área */}
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden flex-1">
                                <div className="p-6 border-b border-[#233f48] flex justify-between items-center">
                                    <h3 className="text-white text-lg font-bold">Progresso por Área</h3>
                                </div>
                                <div className="divide-y divide-[#233f48]">
                                    {sortedAreas.length === 0 ? (
                                        <div className="p-8 text-center bg-[#111e22]">
                                            <span className="material-symbols-outlined text-[#233f48] text-5xl mb-2">checklist</span>
                                            <p className="text-[#92bbc9] font-medium">
                                                {searchQuery ? `Nenhuma área encontrada para "${searchQuery}"` : 'Nenhuma área com rotinas hoje.'}
                                            </p>
                                        </div>
                                    ) : sortedAreas.map((area) => {
                                        let colorClass = 'bg-yellow-500';
                                        if (area.percent >= 100) colorClass = 'bg-[#0bda57]';
                                        else if (area.percent >= 60) colorClass = 'bg-primary';

                                        return (
                                            <div
                                                key={`${area.area_id}-${area.unit?.id ?? 'single'}`}
                                                className="p-4 flex flex-col sm:flex-row items-center gap-4"
                                            >
                                                <div
                                                    className="p-2 rounded-lg shrink-0 size-10 flex items-center justify-center"
                                                    style={{ backgroundColor: `${area.area_color}20`, color: area.area_color }}
                                                >
                                                    <span className="material-symbols-outlined">category</span>
                                                </div>
                                                <div className="flex-1 w-full">
                                                    <div className="flex justify-between mb-1">
                                                        <span className="text-white text-sm font-medium flex items-center gap-2">
                                                            {area.area_name}
                                                            {area.unit && <UnitBadge name={area.unit.name} />}
                                                        </span>
                                                        <span className="text-white text-sm font-bold">
                                                            {area.completed}/{area.total} concluída{area.total !== 1 ? 's' : ''} · {area.percent}%
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-[#111e22] h-2 rounded-full overflow-hidden">
                                                        <div className={`${colorClass} h-full rounded-full transition-all duration-1000`} style={{ width: `${area.percent}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Coluna Direita */}
                        <div className="xl:col-span-1 flex flex-col gap-6">

                            {/* Alertas Prioritários */}
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] flex flex-col h-auto max-h-[500px]">
                                <div className="p-5 border-b border-[#233f48] flex justify-between items-center shrink-0">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-red-400">notifications_active</span>
                                        <h3 className="text-white text-lg font-bold">Alertas Prioritários</h3>
                                    </div>
                                    {alertas_recentes.length > 0 && (
                                        <Link href="/checklists?status=blocked" className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full hover:bg-red-600 transition-colors">
                                            {alertas_recentes.length} Novos
                                        </Link>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    <div className="flex flex-col">
                                        {alertas_recentes.length === 0 ? (
                                            <div className="p-8 text-center flex flex-col items-center gap-3 justify-center text-[#92bbc9]">
                                                <span className="material-symbols-outlined text-4xl text-[#0bda57]">check_circle</span>
                                                <p className="text-sm">Nenhum alerta registrado hoje.</p>
                                            </div>
                                        ) : alertas_recentes.map((alerta, i) => {
                                            const isCritical = alerta.severity === 'critical';
                                            return (
                                                <Link
                                                    key={alerta.id || i}
                                                    href={`/checklists?assumption_id=${alerta.id}`}
                                                    className={`p-4 border-l-4 border-b border-b-[#233f48] transition-colors block ${
                                                        isCritical
                                                            ? 'border-l-red-500 bg-red-500/5 hover:bg-red-500/10'
                                                            : 'border-l-orange-400 bg-orange-400/5 hover:bg-orange-400/10'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <div className="flex items-center gap-2 pr-2 min-w-0">
                                                            <h4 className="text-white font-medium text-sm truncate">{alerta.title}</h4>
                                                            {alerta.unit && <UnitBadge name={alerta.unit.name} />}
                                                        </div>
                                                        <span className="text-[#92bbc9] text-xs shrink-0">{alerta.time_ago}</span>
                                                    </div>
                                                    <p className="text-[#92bbc9] text-xs mb-1 line-clamp-2" title={alerta.notes}>{alerta.notes}</p>
                                                    {alerta.responsavel_nome && (
                                                        <p className="text-[#557682] text-xs">{alerta.responsavel_nome}</p>
                                                    )}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Equipe com Status */}
                            {equipe_detalhes.length > 0 && (
                                <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] p-5">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-white font-bold">Status da Equipe</h3>
                                        <Link href="/equipe" className="text-primary text-xs font-medium hover:underline">Ver todos</Link>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {equipe_detalhes.map(u => (
                                            <Link
                                                key={u.user_id}
                                                href={`/equipe?user_id=${u.user_id}`}
                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#233f48]/50 transition-colors group"
                                            >
                                                <Avatar src={u.avatar} name={u.nome} size={32} className="shrink-0 text-[10px]" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-medium truncate">{u.nome}</p>
                                                    <p className="text-[#557682] text-xs">{u.assumptions_done} {u.assumptions_done === 1 ? 'rotina concluída' : 'rotinas concluídas'}</p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <StatusDot status={u.status} />
                                                    <span className={`text-xs font-medium hidden sm:block ${
                                                        u.status === 'impedimento' ? 'text-red-400' :
                                                        u.status === 'atrasado' ? 'text-yellow-400' :
                                                        u.status === 'concluiu' ? 'text-[#0bda57]' :
                                                        'text-primary'
                                                    }`}>
                                                        {u.status === 'em_andamento' ? 'Em andamento' :
                                                         u.status === 'concluiu' ? 'Concluiu' :
                                                         u.status === 'atrasado' ? 'Atrasado' :
                                                         'Impedimento'}
                                                    </span>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Melhores Desempenhos Hoje */}
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] p-5 flex flex-col">
                                <h3 className="text-white text-lg font-bold mb-4">Melhores Desempenhos Hoje</h3>
                                <div className="flex flex-col gap-4 flex-1">
                                    {top_performers.length === 0 ? (
                                        <div className="py-4 text-center">
                                            <p className="text-[#92bbc9] text-sm">Nenhuma execução registrada hoje ainda.</p>
                                        </div>
                                    ) : top_performers.map((perf, idx) => (
                                        <Link
                                            key={idx}
                                            href={`/equipe?user_id=${perf.user_id}`}
                                            className="flex items-center justify-between hover:bg-[#233f48]/50 rounded-lg p-1 -mx-1 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar
                                                    src={perf.avatar}
                                                    name={perf.name}
                                                    size={40}
                                                    border={idx === 0 ? 'border-primary' : 'border-transparent'}
                                                />
                                                <div className="flex flex-col max-w-[120px]">
                                                    <p className="text-white text-sm font-bold truncate" title={perf.name}>{perf.name}</p>
                                                    <p className="text-[#92bbc9] text-xs truncate" title={perf.role}>{perf.role}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className={`${idx === 0 ? 'text-primary' : 'text-white'} font-bold text-sm`}>{perf.total_done} Tarefas</p>
                                                <p className="text-[#0bda57] text-xs font-medium">{perf.percent_on_time}% No Prazo</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                                <Link
                                    href="/relatorios"
                                    className="block text-center w-full mt-4 py-2 rounded-lg border border-[#233f48] text-[#92bbc9] text-xs font-bold hover:text-white hover:bg-[#233f48] transition-colors"
                                >
                                    Ver Relatório da Equipe
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
