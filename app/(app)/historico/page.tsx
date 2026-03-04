'use client';

import React, { useEffect } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useRouter } from 'next/navigation';
import { useHistoricoUsuario } from '@/lib/hooks/use-execucoes';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function HistoricoStaffPage() {
    const router = useRouter();
    const { restaurantId, userRole } = useRestaurantStore();
    const [userId, setUserId] = React.useState<string | null>(null);

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
        if (userRole && userRole !== 'staff') {
            router.replace('/dashboard');
        }
    }, [userRole, router]);

    const { data: historico, isLoading } = useHistoricoUsuario(restaurantId || null, userId);

    const totalConcluidas = historico?.filter((h: { status: string }) => h.status === 'done').length || 0;
    const totalIncidentes = historico?.filter((h: { status: string }) => h.status === 'flagged').length || 0;

    const renderData = (isoDate: string) => {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        }).format(new Date(isoDate));
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#f6f8f8] dark:bg-[#101d22]">
                <div className="animate-spin text-primary">
                    <span className="material-symbols-outlined text-4xl">refresh</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f6f8f8] dark:bg-[#101d22] font-display text-slate-900 dark:text-white pb-24 mx-auto max-w-[500px] w-full flex flex-col">
            <header className="px-6 py-4 border-b border-gray-200 dark:border-[#233f48] bg-white dark:bg-[#111e22] sticky top-0 z-30">
                <h1 className="text-xl font-bold leading-tight">Histórico Pessoal</h1>
                <p className="text-xs text-slate-500 dark:text-[#92bbc9]">Veja suas execuções anteriores.</p>
            </header>

            <main className="flex-1 p-6 flex flex-col gap-6">
                {/* Métricas Rápidas */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-[#16262c] rounded-xl p-4 border border-gray-200 dark:border-[#233f48] shadow-sm flex flex-col gap-1">
                        <span className="material-symbols-outlined text-primary mb-1 text-[28px]">task_alt</span>
                        <p className="text-[#92bbc9] text-[10px] uppercase font-bold tracking-wider">Concluídas</p>
                        <h3 className="text-2xl font-black">{totalConcluidas}</h3>
                    </div>
                    <div className="bg-white dark:bg-[#16262c] rounded-xl p-4 border border-gray-200 dark:border-[#233f48] shadow-sm flex flex-col gap-1">
                        <span className="material-symbols-outlined text-amber-500 mb-1 text-[28px]">warning</span>
                        <p className="text-[#92bbc9] text-[10px] uppercase font-bold tracking-wider">Incidentes</p>
                        <h3 className="text-2xl font-black">{totalIncidentes}</h3>
                    </div>
                </div>

                {/* Lista Top */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Últimos Registros</h3>

                    {(!historico || historico.length === 0) ? (
                        <div className="p-8 text-center text-slate-500 dark:text-[#92bbc9] bg-white dark:bg-[#16262c] rounded-xl border border-dashed border-gray-200 dark:border-[#233f48]">
                            Nenhum histórico registrado até o momento.
                        </div>
                    ) : (
                        historico.map((h: { id: string; status: string; checklist_tasks: { title: string }; checklists: { name: string }; executed_at: string }) => (
                            <div key={h.id} className="bg-white dark:bg-[#16262c] rounded-xl p-4 border border-gray-200 dark:border-[#233f48] shadow-sm flex gap-4">
                                <div className={`mt-1 shrink-0 flex items-center justify-center size-8 rounded-full border-2 
                                         ${h.status === 'done' ? 'border-primary text-primary' : 'border-amber-500 text-amber-500'}
                                   `}>
                                    <span className="material-symbols-outlined text-[16px]">
                                        {h.status === 'done' ? 'check' : 'warning'}
                                    </span>
                                </div>
                                <div className="flex-1 flex flex-col gap-1.5">
                                    <h4 className="text-sm font-bold leading-tight">{h.checklist_tasks?.title}</h4>
                                    <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500 dark:text-[#92bbc9] uppercase">
                                        <span>{h.checklists?.name}</span>
                                        <span>•</span>
                                        <span>{renderData(h.executed_at)}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Float Action Navigation */}
            <div className="fixed bottom-0 left-0 right-0 w-full bg-white dark:bg-[#111e22] border-t border-gray-200 dark:border-[#233f48] px-6 py-4 flex justify-between items-center max-w-[500px] mx-auto z-40 pb-safe">
                <Link href="/historico" className="flex flex-col items-center gap-1 text-primary transition-colors">
                    <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
                    <span className="text-[10px] font-medium uppercase">Histórico</span>
                </Link>

                <Link href="/turno" className="flex flex-col items-center gap-1 text-slate-500 dark:text-[#92bbc9] hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-2xl">fact_check</span>
                    <span className="text-[10px] font-medium uppercase">Turno Atual</span>
                </Link>

                <div className="flex flex-col items-center gap-1 text-slate-500 dark:text-[#92bbc9] hover:text-red-400 transition-colors cursor-not-allowed opacity-50">
                    <span className="material-symbols-outlined text-2xl">warning</span>
                    <span className="text-[10px] font-medium uppercase">Incidente</span>
                </div>
            </div>
        </div>
    );
}
