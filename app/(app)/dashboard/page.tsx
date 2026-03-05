"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';

export default function DashboardPage() {
    const router = useRouter();
    const userRole = useRestaurantStore((state) => state.userRole);

    useEffect(() => {
        if (userRole === 'staff') {
            router.replace('/turno');
        }
    }, [userRole, router]);
    const metrics = [
        { title: "Conclusão Diária", value: "85%", change: "+5% vs ontem", changeType: "positive", icon: "task_alt" },
        { title: "Alertas Abertos", value: "3", change: "Ação necessária", changeType: "negative", icon: "warning" },
        { title: "Equipe Ativa", value: "12/15", change: "Turno atual", changeType: "neutral", icon: "group" },
        { title: "Tempo Médio", value: "12m", change: "-2m vs média", changeType: "positive", icon: "timer" },
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
