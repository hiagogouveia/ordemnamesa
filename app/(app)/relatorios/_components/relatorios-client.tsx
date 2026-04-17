"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRelatorios } from '@/lib/hooks/use-relatorios';
import { Avatar } from '@/components/ui/avatar';
import { UnitBadge } from '@/components/ui/unit-badge';
import type { Scope } from '@/lib/types/scope';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function RelatoriosSkeleton() {
    return (
        <div className="flex-1 p-4 md:p-8 bg-[#101d22] animate-pulse">
            <div className="max-w-5xl mx-auto flex flex-col gap-6">
                {/* header */}
                <div className="flex items-center justify-between">
                    <div className="h-8 w-40 rounded bg-[#233f48]" />
                    <div className="h-10 w-28 rounded-lg bg-[#233f48]" />
                </div>
                {/* metric cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] flex flex-col gap-3">
                            <div className="h-3 w-20 rounded bg-[#233f48]" />
                            <div className="h-8 w-14 rounded bg-[#233f48]" />
                        </div>
                    ))}
                </div>
                {/* performers + recent */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                        <div className="h-12 bg-[#192d33] border-b border-[#233f48]" />
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-[#233f48]">
                                <div className="size-10 rounded-full bg-[#233f48] shrink-0" />
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="h-3 w-28 rounded bg-[#233f48]" />
                                    <div className="h-2 w-full rounded-full bg-[#233f48]" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                        <div className="h-12 bg-[#192d33] border-b border-[#233f48]" />
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-[#233f48]">
                                <div className="size-6 rounded-full bg-[#233f48] shrink-0" />
                                <div className="flex-1 h-3 rounded bg-[#233f48]" />
                                <div className="h-5 w-16 rounded-full bg-[#233f48]" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface Props {
    scope: Scope;
    isGlobal: boolean;
    accountName: string | null;
}

export function RelatoriosClient({ scope, isGlobal, accountName }: Props) {
    const router = useRouter();

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString();
    });
    const [endDate] = useState(() => new Date().toISOString());

    const { data: relData, isLoading, error } = useRelatorios(scope, startDate, endDate);

    if (isLoading) {
        return <RelatoriosSkeleton />;
    }

    if (error) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-[#101d22] gap-4">
                <span className="material-symbols-outlined text-red-500 text-6xl">error</span>
                <p className="text-white">Erro ao carregar os dados dos relatórios.</p>
            </div>
        );
    }

    const { metrics, consistencia_semanal, top_performers, registros_recentes } = relData || {
        metrics: { taxa_conclusao: 0, taxa_conclusao_diff: 0, tarefas_pendentes: 0, colaboradores_ativos: 0, avaliacao: '0.0', total_registros: 0 },
        consistencia_semanal: [],
        top_performers: [],
        registros_recentes: []
    };

    const handlePeriodChange = (val: string) => {
        const d = new Date();
        if (val === '7days') d.setDate(d.getDate() - 7);
        else if (val === '30days') d.setDate(d.getDate() - 30);
        else if (val === '90days') d.setDate(d.getDate() - 90);
        setStartDate(d.toISOString());
    };

    const handleExport = async () => {
        try {
            const supabase = (await import('@/lib/supabase/client')).createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || '';

            let exportUrl = `/api/relatorios?start_date=${startDate}&end_date=${endDate}&format=csv`;
            if (isGlobal && scope.mode === 'global') {
                exportUrl += `&account_id=${scope.accountId}&mode=global`;
            } else if (scope.mode === 'single') {
                exportUrl += `&restaurant_id=${scope.restaurantId}`;
            }

            const response = await fetch(exportUrl, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) return;

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao exportar CSV:', error);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background-light dark:bg-background-dark relative">
            <header className="md:hidden flex items-center justify-between p-4 border-b border-[#233f48] bg-[#101d22] sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/20 text-primary rounded-lg size-8 flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm">restaurant</span>
                    </div>
                    <span className="text-white font-bold text-sm">Ordem na Mesa</span>
                </div>
                <button className="text-white">
                    <span className="material-symbols-outlined">menu</span>
                </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
                <div className="max-w-7xl mx-auto flex flex-col gap-8">
                    {/* Page Heading & Actions */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-white text-3xl md:text-4xl font-black tracking-tight">
                                {isGlobal ? 'Relatórios — Visão Global' : 'Relatórios da Unidade'}
                            </h2>
                            <p className="text-[#92bbc9] text-base">
                                {isGlobal
                                    ? `Análise consolidada de todas as unidades${accountName ? ` · ${accountName}` : ''}`
                                    : 'Análise de desempenho, consistência e registros do seu restaurante.'}
                            </p>
                        </div>
                        <button onClick={handleExport} className="flex items-center justify-center gap-2 bg-primary hover:bg-cyan-400 text-[#111e22] font-bold py-2.5 px-6 rounded-lg transition-all shadow-md active:scale-95">
                            <span className="material-symbols-outlined text-[20px]">download</span>
                            <span>Exportar CSV</span>
                        </button>
                    </div>

                    {/* Toolbar: Filters */}
                    <div className="flex flex-col md:flex-row gap-4 bg-[#1a2c32] p-4 rounded-xl border border-[#233f48] items-center justify-between">
                        <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                            <div className="flex border border-[#233f48] rounded-lg bg-[#101d22] p-1">
                                <button className="px-4 py-1.5 text-sm font-medium text-white bg-[#233f48] rounded shadow-sm whitespace-nowrap">
                                    Visão Geral
                                </button>
                                <button className="px-4 py-1.5 text-sm font-medium text-[#92bbc9] hover:text-white transition-colors whitespace-nowrap">
                                    Por Checklist
                                </button>
                                <button className="px-4 py-1.5 text-sm font-medium text-[#92bbc9] hover:text-white transition-colors whitespace-nowrap">
                                    Incidentes
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <span className="text-[#92bbc9] text-sm whitespace-nowrap">Período de Análise:</span>
                            <select
                                defaultValue="30days"
                                onChange={(e) => handlePeriodChange(e.target.value)}
                                className="bg-[#101d22] text-white border border-[#233f48] rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary w-full md:w-48 cursor-pointer">
                                <option value="7days">Últimos 7 dias</option>
                                <option value="30days">Últimos 30 dias</option>
                                <option value="90days">Últimos 90 dias</option>
                            </select>
                        </div>
                    </div>

                    {/* Resumo Overview */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 shadow-sm">
                            <p className="text-[#92bbc9] font-medium text-sm mb-2">Taxa de Conclusão</p>
                            <div className="flex items-end gap-3">
                                <h3 className="text-white text-3xl font-bold leading-none">{metrics.taxa_conclusao}%</h3>
                                <span className={`text-sm font-medium flex items-center mb-1 ${metrics.taxa_conclusao_diff > 0 ? 'text-[#0bda57]' : 'text-red-400'}`}>
                                    <span className="material-symbols-outlined text-[16px] mr-0.5">{metrics.taxa_conclusao_diff > 0 ? 'trending_up' : 'trending_down'}</span>
                                    {metrics.taxa_conclusao_diff}%
                                </span>
                            </div>
                        </div>
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 shadow-sm">
                            <p className="text-[#92bbc9] font-medium text-sm mb-2">Tarefas Pendentes/Alertas</p>
                            <div className="flex items-end gap-3">
                                <h3 className={`text-3xl font-bold leading-none ${metrics.tarefas_pendentes > 0 ? 'text-red-400' : 'text-white'}`}>{metrics.tarefas_pendentes}</h3>
                                <span className="text-[#92bbc9] text-sm font-medium mb-1">no período</span>
                            </div>
                        </div>
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 shadow-sm">
                            <p className="text-[#92bbc9] font-medium text-sm mb-2">Colaboradores Ativos</p>
                            <div className="flex items-end gap-3">
                                <h3 className="text-white text-3xl font-bold leading-none">{metrics.colaboradores_ativos}</h3>
                            </div>
                        </div>
                        <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 shadow-sm">
                            <p className="text-[#92bbc9] font-medium text-sm mb-2">Avaliação Média</p>
                            <div className="flex items-end gap-2">
                                <h3 className="text-white text-3xl font-bold leading-none">{metrics.avaliacao}</h3>
                                <div className="flex mb-1">
                                    <span className="material-symbols-outlined text-yellow-500 text-[18px]">star</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Coluna Principal: Gráficos e Tabelas */}
                        <div className="lg:col-span-2 flex flex-col gap-6">

                            {/* Consistência Semanal (Visual) */}
                            <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-6 shadow-sm">
                                <h3 className="text-white text-lg font-bold mb-1">Consistência da Operação</h3>
                                <p className="text-[#92bbc9] text-sm mb-8">Volumetria de conclusão das tarefas (Exibição Últimos 7 dias em relação à média)</p>

                                <div className="h-64 w-full flex items-end justify-between gap-1 sm:gap-2 pt-8 border-b border-[#233f48] pb-2 relative">
                                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-2 pt-8">
                                        <div className="border-t border-dashed border-[#233f48] opacity-30 h-0"></div>
                                        <div className="border-t border-dashed border-[#233f48] opacity-30 h-0"></div>
                                        <div className="border-t border-dashed border-[#233f48] opacity-30 h-0"></div>
                                        <div className="border-t border-dashed border-[#233f48] opacity-30 h-0"></div>
                                    </div>

                                    {consistencia_semanal.length > 0 ? consistencia_semanal.map((dia, idx) => {
                                        const isHigh = dia.percent >= 80;
                                        return (
                                            <div key={idx} className="flex flex-col items-center flex-1 z-10 group h-full justify-end cursor-pointer">
                                                <div
                                                    className={`w-full max-w-[48px] rounded-t-lg transition-all relative ${isHigh ? 'bg-primary/80 hover:bg-primary' : 'bg-[#233f48] hover:bg-[#233f48]/80'}`}
                                                    style={{ height: `${dia.percent > 0 ? dia.percent : 10}%` }}
                                                >
                                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#111e22] text-white text-xs px-2 py-1 rounded border border-[#233f48] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                                        {dia.percent}%
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="w-full text-center text-[#92bbc9]">Sem dados semanais.</div>
                                    )}
                                </div>
                                <div className="flex justify-between mt-2 px-1 text-xs text-[#92bbc9] uppercase font-bold tracking-wider">
                                    {consistencia_semanal.map((dia, i) => (
                                        <span key={i} className="flex-1 text-center">{dia.date_label}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Registros Recentes Tabela Restrita */}
                            <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 h-[400px]">
                                <div className="p-5 border-b border-[#233f48] bg-[#1a2c32]">
                                    <h3 className="text-white text-lg font-bold">Registros Recentes de Tarefas</h3>
                                </div>
                                <div className="overflow-y-auto flex-1 h-full">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#152328] sticky top-0 z-10">
                                            <tr>
                                                <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase border-y border-[#233f48]">Atividade</th>
                                                <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase border-y border-[#233f48]">Status</th>
                                                <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase border-y border-[#233f48]">Responsável</th>
                                                <th className="p-4 text-xs font-semibold text-[#92bbc9] uppercase border-y border-[#233f48] text-right">Data/Hora</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#233f48]">
                                            {registros_recentes.length === 0 ? (
                                                <tr><td colSpan={4} className="p-8 text-center text-[#92bbc9]">Nenhum registro para este período.</td></tr>
                                            ) : registros_recentes.map((reg) => (
                                                <tr key={reg.id} className="hover:bg-[#233f48]/30 transition-colors">
                                                    <td className="p-4">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-white text-sm font-medium">{reg.task_name}</span>
                                                            {reg.unit && <UnitBadge name={reg.unit.name} />}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        {(reg.status === 'done' || reg.status === 'completed') && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#0bda57]/10 text-[#0bda57] uppercase tracking-wider">
                                                                Concluído
                                                            </span>
                                                        )}
                                                        {reg.status === 'flagged' && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 uppercase tracking-wider">
                                                                Incidente
                                                            </span>
                                                        )}
                                                        {reg.status === 'skipped' && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-500 uppercase tracking-wider">
                                                                Pulada
                                                            </span>
                                                        )}
                                                        {reg.status === 'doing' && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 uppercase tracking-wider">
                                                                Em andamento
                                                            </span>
                                                        )}
                                                        {reg.status === 'partial' && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-500 uppercase tracking-wider">
                                                                Parcial
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            <Avatar
                                                                src={reg.executor_avatar}
                                                                name={reg.executor_name}
                                                                size={24}
                                                                border="border-[#233f48]"
                                                            />
                                                            <span className="text-[#92bbc9] text-sm truncate max-w-[120px]" title={reg.executor_name}>{reg.executor_name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <span className="text-white text-sm whitespace-nowrap">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(reg.executed_at)).replace(',', ' às')}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Coluna Lateral: Top Performers */}
                        <div className="lg:col-span-1">
                            <div className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-6 shadow-sm flex flex-col h-full">
                                <h3 className="text-white text-lg font-bold mb-1">Desempenho por Colaborador</h3>
                                <p className="text-[#92bbc9] text-sm mb-6">Top contribuintes no período selecionado</p>

                                <div className="flex flex-col gap-5 flex-1 overflow-y-auto pr-2">
                                    {top_performers.length === 0 ? (
                                        <p className="text-[#92bbc9] text-sm text-center my-8">Sem execuções no período.</p>
                                    ) : top_performers.map((perf, idx) => {
                                        let medalColor = "text-white";
                                        let medalIcon = "";
                                        if (idx === 0) { medalColor = "text-yellow-400"; medalIcon = "workspace_premium"; }
                                        else if (idx === 1) { medalColor = "text-gray-300"; medalIcon = "military_tech"; }
                                        else if (idx === 2) { medalColor = "text-amber-600"; medalIcon = "military_tech"; }

                                        return (
                                            <div key={idx} className="flex flex-col gap-2 p-3 bg-[#111e22] rounded-lg border border-[#233f48] hover:border-primary/50 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar
                                                            src={perf.avatar}
                                                            name={perf.name}
                                                            size={40}
                                                            border="border-[#233f48]"
                                                        />
                                                        <div>
                                                            <p className="text-white font-bold text-sm truncate max-w-[120px]" title={perf.name}>{perf.name}</p>
                                                            <p className="text-[#92bbc9] text-xs font-medium">{perf.total_done} Tarefas Concluídas</p>
                                                            {perf.unit && <UnitBadge name={perf.unit.name} />}
                                                        </div>
                                                    </div>
                                                    {medalIcon && (
                                                        <span className={`material-symbols-outlined text-[28px] ${medalColor}`} title={`#${idx + 1} Lugar`}>
                                                            {medalIcon}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="flex-1 h-1.5 bg-[#233f48] rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary rounded-full" style={{ width: `${perf.percent}%` }}></div>
                                                    </div>
                                                    <span className="text-[10px] text-[#92bbc9] font-bold w-6 text-right">{perf.percent}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button onClick={() => router.push('/equipe')} className="w-full mt-6 py-2.5 rounded-lg border border-[#233f48] text-white text-sm font-bold hover:bg-[#233f48] transition-colors">
                                    Ver Todos da Equipe
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
