"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useDashboard } from '@/lib/hooks/use-dashboard';

export default function DashboardPage() {
    const router = useRouter();
    const { userRole, restaurantId } = useRestaurantStore();
    const [isMounted, setIsMounted] = useState(false);

    const { data: dashboardData, isLoading } = useDashboard(restaurantId);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (userRole === 'staff') {
            router.replace('/turno');
        }
    }, [userRole, router]);

    // Previne SSR mismatch e Flash do dashboard na navegação de staff
    if (!isMounted || !userRole || userRole === 'staff' || isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0a1215]">
                <div className="animate-spin text-[#13b6ec]">
                    <span className="material-symbols-outlined text-4xl">refresh</span>
                </div>
            </div>
        );
    }

    const {
        conclusao_diaria_percent = 0,
        alertas_abertos = 0,
        equipe_ativa = 0,
        progresso_geral = 0,
        total_tasks = 0,
        done_tasks = 0
    } = dashboardData || {};

    const metrics = [
        { title: "Conclusão Diária", value: `${conclusao_diaria_percent}%`, change: `${done_tasks} de ${total_tasks} concluídas`, changeType: "neutral", icon: "task_alt" },
        { title: "Alertas Abertos", value: alertas_abertos.toString(), change: alertas_abertos > 0 ? "Ação necessária" : "Tudo sob controle", changeType: alertas_abertos > 0 ? "negative" : "positive", icon: "warning" },
        { title: "Equipe Ativa", value: equipe_ativa.toString(), change: "Turno atual (Staffs viculados)", changeType: "neutral", icon: "group" },
        { title: "Progresso Geral", value: `${progresso_geral}%`, change: "Desempenho da unidade", changeType: progresso_geral > 80 ? "positive" : "neutral", icon: "timer" },
    ];

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
            {/* Banner Sprint 5 */}
            <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#13b6ec]/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="material-symbols-outlined text-[#13b6ec] text-3xl">construction</span>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Em construção — Sprint 5</h2>
                    </div>
                    <p className="text-[#92bbc9] text-base max-w-2xl">
                        O dashboard completo com gráficos em tempo real, relatórios de produtividade e visão geral do salão será implementado no Sprint 5. Por enquanto, utilize o menu lateral para gerenciar as rotinas do seu restaurante.
                    </p>
                </div>
            </div>

            {/* Cards de Métricas Mockados */}
            <div>
                <h3 className="text-lg font-bold text-white mb-4">Visão Geral (Dados Simulados)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {metrics.map((metric, index) => (
                        <div key={index} className="bg-[#16262c] border border-[#233f48] rounded-xl p-5 hover:border-[#325a67] transition-colors relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-10 h-10 rounded-lg bg-[#101d22] border border-[#233f48] flex items-center justify-center shrink-0 group-hover:bg-[#233f48] transition-colors">
                                    <span className={`material-symbols-outlined text-[20px] ${metric.changeType === 'positive' ? 'text-emerald-400' :
                                        metric.changeType === 'negative' ? 'text-amber-400' :
                                            'text-[#13b6ec]'
                                        }`}>
                                        {metric.icon}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <h4 className="text-sm font-medium text-[#92bbc9]">{metric.title}</h4>
                                <div className="text-3xl font-bold text-white tracking-tight">{metric.value}</div>
                                <div className={`text-xs font-semibold mt-2 ${metric.changeType === 'positive' ? 'text-emerald-400' :
                                    metric.changeType === 'negative' ? 'text-amber-400' :
                                        'text-[#92bbc9]'
                                    }`}>
                                    {metric.change}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
