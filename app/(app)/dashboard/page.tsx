"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useDashboard } from '@/lib/hooks/use-dashboard';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
    return (
        <div className="flex-1 flex flex-col min-w-0 bg-[#101d22] animate-pulse">
            {/* header */}
            <div className="h-16 px-6 border-b border-[#233f48] flex items-center gap-4">
                <div className="h-5 w-40 rounded bg-[#233f48]" />
            </div>
            <main className="flex-1 p-4 md:p-6">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    {/* 4 stat cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] flex flex-col gap-3">
                                <div className="h-3 w-24 rounded bg-[#233f48]" />
                                <div className="h-9 w-20 rounded bg-[#233f48]" />
                                <div className="h-1.5 w-full rounded-full bg-[#233f48]" />
                            </div>
                        ))}
                    </div>
                    {/* chart + side panels */}
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
// Uso de datas com Intl API


export default function DashboardPage() {
    const router = useRouter();
    const { userRole, restaurantId, restaurantName } = useRestaurantStore();

    const { data: dashboardData, isLoading, error } = useDashboard(restaurantId);

    useEffect(() => {
        if (userRole === 'staff') {
            router.replace('/turno');
        }
    }, [userRole, router]);

    if (!userRole || userRole === 'staff' || isLoading) {
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

    // Default fallback to prevent destructure crash
    const {
        conclusao_diaria_percent = 0,
        conclusao_diaria_diff = 0,
        alertas_abertos = 0,
        alertas_abertos_diff = 0,
        equipe_ativa = 0,
        equipe_ativa_diff = 0,
        equipe_avatars = [],
        tempo_resposta_mins = 0,
        tempo_resposta_diff_mins = 0,
        tendencias = [],
        checklist_progresso = [],
        alertas_recentes = [],
        top_performers = [],
    } = dashboardData || {};

    const todayDateStr = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date());
    const formattedDate = todayDateStr.charAt(0).toUpperCase() + todayDateStr.slice(1);

    const handleExport = async () => {
        if (!restaurantId) return;
        try {
            // Em aplicação real, iria abrir um _blank com o endpoint CSV
            const response = await fetch(`/api/dashboard?restaurant_id=${restaurantId}&format=csv`);
            if (response.ok) {
                // Trigger fake download or toast
                alert("Relatório CSV gerado com sucesso. Verifique seus downloads.");
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark">
            <header className="flex items-center justify-between h-16 px-6 border-b border-[#233f48] bg-surface-dark/50 backdrop-blur-sm sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <button className="md:hidden text-white">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                    <div>
                        <h2 className="text-white text-lg font-bold leading-tight">Visão Geral Hoje</h2>
                        <p className="text-[#92bbc9] text-xs capitalize">{formattedDate} • {restaurantName || 'Matriz'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center bg-[#233f48] rounded-lg h-10 w-64 px-3 border border-transparent focus-within:border-primary transition-all">
                        <span className="material-symbols-outlined text-[#92bbc9]">search</span>
                        <input className="bg-transparent border-none text-white text-sm w-full focus:ring-0 placeholder-[#92bbc9]" placeholder="Buscar tarefas, equipe..." type="text" />
                    </div>
                    <div className="flex gap-2">
                        <button className="flex items-center justify-center h-10 px-4 rounded-lg bg-[#233f48] hover:bg-[#2f505a] text-white text-sm font-bold transition-colors gap-2">
                            <span className="material-symbols-outlined text-sm">calendar_today</span>
                            <span className="hidden sm:inline">Esta Semana</span>
                        </button>
                        <button onClick={handleExport} className="flex items-center justify-center h-10 px-4 rounded-lg bg-primary hover:bg-cyan-400 text-[#111e22] text-sm font-bold transition-colors shadow-[0_0_15px_rgba(19,182,236,0.3)] gap-2">
                            <span className="material-symbols-outlined text-sm">download</span>
                            <span className="hidden sm:inline">Exportar</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    {/* Cards Superiores */}
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
                                        <span className={`text-sm font-medium flex items-center px-1.5 py-0.5 rounded ${conclusao_diaria_diff > 0 ? 'text-[#0bda57] bg-[#0bda57]/10' : 'text-red-400 bg-red-400/10'
                                            }`}>
                                            <span className="material-symbols-outlined text-sm mr-0.5">
                                                {conclusao_diaria_diff > 0 ? 'trending_up' : 'trending_down'}
                                            </span>
                                            {conclusao_diaria_diff > 0 ? '+' : ''}{conclusao_diaria_diff}%
                                        </span>
                                    )}
                                </div>
                                <div className="w-full bg-[#233f48] h-1.5 rounded-full mt-3">
                                    <div className="bg-primary h-1.5 rounded-full transition-all duration-1000" style={{ width: `${conclusao_diaria_percent}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Alertas Abertos */}
                        <div className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl text-red-400">warning</span>
                            </div>
                            <div className="flex flex-col gap-1 relative z-10">
                                <p className="text-[#92bbc9] text-sm font-medium">Alertas Abertos</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-white text-3xl font-bold">{alertas_abertos}</h3>
                                    {alertas_abertos > 0 && (
                                        <span className="text-red-400 text-sm font-medium flex items-center bg-red-400/10 px-1.5 py-0.5 rounded">
                                            {alertas_abertos_diff > 0 ? <><span className="material-symbols-outlined text-sm mr-0.5">trending_up</span>+{alertas_abertos_diff}</> : null}
                                        </span>
                                    )}
                                </div>
                                <p className={`text-xs mt-3 ${alertas_abertos > 0 ? 'text-red-400 font-bold' : 'text-[#92bbc9]'}`}>
                                    {alertas_abertos > 0 ? 'Requer atenção imediata' : 'Tudo certo no turno'}
                                </p>
                            </div>
                        </div>

                        {/* Equipe Ativa */}
                        <div className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl text-primary">groups</span>
                            </div>
                            <div className="flex flex-col gap-1 relative z-10">
                                <p className="text-[#92bbc9] text-sm font-medium">Equipe Ativa</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-white text-3xl font-bold">{equipe_ativa}</h3>
                                    <span className="text-[#92bbc9] text-sm font-medium bg-[#92bbc9]/10 px-1.5 py-0.5 rounded">
                                        {equipe_ativa_diff === 0 ? '0 alteração' : (equipe_ativa_diff > 0 ? `+${equipe_ativa_diff} hoje` : `${equipe_ativa_diff} hoje`)}
                                    </span>
                                </div>
                                <div className="flex -space-x-2 mt-3">
                                    {equipe_avatars.map((avatar, idx) => (
                                        <Avatar
                                            key={idx}
                                            src={avatar.avatar}
                                            name={avatar.nome}
                                            size={24}
                                            border="border-surface-dark"
                                            className="text-[8px]"
                                        />
                                    ))}
                                    {equipe_ativa > 3 && (
                                        <div className="size-6 shrink-0 rounded-full border border-surface-dark bg-[#233f48] flex items-center justify-center text-[10px] text-white">
                                            +{equipe_ativa - 3}
                                        </div>
                                    )}
                                    {equipe_ativa === 0 && <span className="text-xs text-[#92bbc9]">Sem logins</span>}
                                </div>
                            </div>
                        </div>

                        {/* Tempo Médio de Resposta */}
                        <div className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl text-primary">timelapse</span>
                            </div>
                            <div className="flex flex-col gap-1 relative z-10">
                                <p className="text-[#92bbc9] text-sm font-medium">Tempo Médio de Resposta</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-white text-3xl font-bold">{tempo_resposta_mins > 0 ? `${tempo_resposta_mins}m` : '—'}</h3>
                                    {tempo_resposta_diff_mins !== 0 && (
                                        <span className={`text-sm font-medium flex items-center px-1.5 py-0.5 rounded ${tempo_resposta_diff_mins < 0 ? 'text-[#0bda57] bg-[#0bda57]/10' : 'text-red-400 bg-red-400/10'
                                            }`}>
                                            <span className="material-symbols-outlined text-sm mr-0.5">
                                                {tempo_resposta_diff_mins < 0 ? 'trending_down' : 'trending_up'}
                                            </span>
                                            {tempo_resposta_diff_mins < 0 ? tempo_resposta_diff_mins : `+${tempo_resposta_diff_mins}`}m
                                        </span>
                                    )}
                                </div>
                                <p className={`text-xs mt-3 capitalize ${tempo_resposta_diff_mins < 0 ? 'text-[#0bda57]' : (tempo_resposta_diff_mins > 0 ? 'text-red-400' : 'text-[#92bbc9]')}`}>
                                    {tempo_resposta_diff_mins < 0 ? 'Mais rápido que ontem' : (tempo_resposta_diff_mins > 0 ? 'Mais lento que ontem' : 'Tempo de resposta constante')}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full">
                        {/* Coluna Esquerda: Tendências e Checklists */}
                        <div className="xl:col-span-2 flex flex-col gap-6">

                            {/* Tendências de Execução */}
                            <div className="bg-[#1a2c32] rounded-xl p-6 border border-[#233f48]">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                    <div>
                                        <h3 className="text-white text-lg font-bold">Tendências de Execução</h3>
                                        <p className="text-[#92bbc9] text-sm">Taxa de conclusão de tarefas nos últimos 7 dias</p>
                                    </div>
                                    <div className="flex bg-[#111e22] rounded-lg p-1 border border-[#233f48]">
                                        <button className="px-3 py-1 text-xs font-medium text-white bg-[#233f48] rounded shadow-sm">Diário</button>
                                        <button className="px-3 py-1 text-xs font-medium text-[#92bbc9] hover:text-white transition-colors">Semanal</button>
                                        <button className="px-3 py-1 text-xs font-medium text-[#92bbc9] hover:text-white transition-colors">Mensal</button>
                                    </div>
                                </div>
                                <div className="h-64 w-full flex items-end justify-between gap-2 sm:gap-4 px-2">
                                    {tendencias.length > 0 ? tendencias.map((tendencia, i) => {
                                        const isToday = i === tendencias.length - 1; // Último elemento do mock array na api
                                        return (
                                            <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full justify-end group cursor-pointer">
                                                <div
                                                    className={`relative w-full max-w-[40px] rounded-t-lg transition-all ${isToday
                                                        ? 'bg-primary shadow-[0_0_15px_rgba(19,182,236,0.3)]'
                                                        : 'bg-[#233f48] group-hover:bg-primary/50'
                                                        }`}
                                                    style={{ height: `${tendencia.percent > 0 ? tendencia.percent : 10}%` }}
                                                >
                                                    <div className={`absolute -top-8 left-1/2 -translate-x-1/2 bg-[#111e22] text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-[#233f48] z-10 transition-opacity ${isToday ? 'opacity-100 font-bold' : 'opacity-0 group-hover:opacity-100'
                                                        }`}>
                                                        {tendencia.percent}%
                                                    </div>
                                                </div>
                                                <span className={`text-xs ${isToday ? 'text-white font-bold' : 'text-[#92bbc9]'}`}>
                                                    {tendencia.date_label}
                                                </span>
                                            </div>
                                        );
                                    }) : (
                                        <div className="flex items-center justify-center w-full h-full text-[#92bbc9]"><p>Carregando gráfico...</p></div>
                                    )}
                                </div>
                            </div>

                            {/* Progresso por Área */}
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden flex-1">
                                <div className="p-6 border-b border-[#233f48] flex justify-between items-center">
                                    <h3 className="text-white text-lg font-bold">Progresso por Área</h3>
                                    <Link href="/checklists" className="text-primary text-sm font-medium hover:underline">
                                        Ver Todos os Checklists
                                    </Link>
                                </div>
                                <div className="divide-y divide-[#233f48]">
                                    {checklist_progresso.length === 0 ? (
                                        <div className="p-8 text-center bg-[#111e22]">
                                            <span className="material-symbols-outlined text-[#233f48] text-5xl mb-2">checklist</span>
                                            <p className="text-[#92bbc9] font-medium">Nenhum checklist ativo no momento.</p>
                                        </div>
                                    ) : checklist_progresso.map((checklist, idx) => {
                                        let colorClass = 'bg-yellow-500';
                                        let textClass = 'text-yellow-500';
                                        let bgLight = 'bg-yellow-500/10';
                                        let borderClass = 'border-yellow-500/20';

                                        if (checklist.percent >= 100) {
                                            colorClass = 'bg-[#0bda57]';
                                            textClass = 'text-[#0bda57]';
                                            bgLight = 'bg-[#0bda57]/10';
                                            borderClass = 'border-[#0bda57]/20';
                                        } else if (checklist.percent >= 60) {
                                            colorClass = 'bg-primary';
                                            textClass = 'text-primary';
                                            bgLight = 'bg-primary/10';
                                            borderClass = 'border-primary/20';
                                        }

                                        return (
                                            <div key={idx} className="p-4 flex flex-col sm:flex-row items-center gap-4 hover:bg-[#233f48]/50 transition-colors">
                                                <div className="bg-[#233f48] p-2 rounded-lg text-primary shrink-0">
                                                    <span className="material-symbols-outlined">{checklist.icon}</span>
                                                </div>
                                                <div className="flex-1 w-full">
                                                    <div className="flex justify-between mb-1">
                                                        <span className="text-white text-sm font-medium">{checklist.title}</span>
                                                        <span className="text-white text-sm font-bold">{checklist.percent}%</span>
                                                    </div>
                                                    <div className="w-full bg-[#111e22] h-2 rounded-full overflow-hidden">
                                                        <div className={`${colorClass} h-full rounded-full transition-all duration-1000`} style={{ width: `${checklist.percent}%` }}></div>
                                                    </div>
                                                </div>
                                                <span className={`hidden sm:block px-3 py-1 ${bgLight} ${textClass} text-xs font-medium rounded-full border ${borderClass} whitespace-nowrap`}>
                                                    {checklist.status}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Coluna Direita: Alertas e Perfomers */}
                        <div className="xl:col-span-1 flex flex-col gap-6">

                            {/* Alertas Prioritários */}
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] flex flex-col h-auto max-h-[500px]">
                                <div className="p-5 border-b border-[#233f48] flex justify-between items-center shrink-0">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-red-400">notifications_active</span>
                                        <h3 className="text-white text-lg font-bold">Alertas Prioritários</h3>
                                    </div>
                                    {alertas_recentes.length > 0 && (
                                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{alertas_recentes.length} Novos</span>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    <div className="flex flex-col">
                                        {alertas_recentes.length === 0 ? (
                                            <div className="p-8 text-center flex flex-col items-center gap-3 h-full justify-center text-[#92bbc9]">
                                                <span className="material-symbols-outlined text-4xl text-[#0bda57]">check_circle</span>
                                                <p className="text-sm">Nenhum alerta registrado hoje.</p>
                                            </div>
                                        ) : alertas_recentes.map((alerta, i) => {
                                            const isCritical = alerta.severity === 'critical';
                                            return (
                                                <div key={alerta.id || i} className={`p-4 border-l-4 border-b border-b-[#233f48] transition-colors ${isCritical
                                                    ? 'border-l-red-500 bg-red-500/5 hover:bg-red-500/10'
                                                    : 'border-l-orange-400 bg-orange-400/5 hover:bg-orange-400/10'
                                                    }`}>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="text-white font-medium text-sm pr-2 truncate">{alerta.title}</h4>
                                                        <span className="text-[#92bbc9] text-xs shrink-0">{alerta.time_ago}</span>
                                                    </div>
                                                    <p className="text-[#92bbc9] text-xs mb-2 line-clamp-2" title={alerta.notes}>{alerta.notes}</p>
                                                    <button className={`text-xs font-bold uppercase tracking-wider ${isCritical ? 'text-red-400 hover:text-red-300' : 'text-orange-400 hover:text-orange-300'
                                                        }`}>
                                                        Reconhecer
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Melhores Desempenhos Hoje */}
                            <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] p-5 flex flex-col">
                                <h3 className="text-white text-lg font-bold mb-4">Melhores Desempenhos Hoje</h3>
                                <div className="flex flex-col gap-4 flex-1">
                                    {top_performers.length === 0 ? (
                                        <div className="py-4 text-center">
                                            <p className="text-[#92bbc9] text-sm">Nenhuma execução registrada hoje ainda.</p>
                                        </div>
                                    ) : top_performers.map((perf, idx) => (
                                        <div key={idx} className="flex items-center justify-between">
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
                                        </div>
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
