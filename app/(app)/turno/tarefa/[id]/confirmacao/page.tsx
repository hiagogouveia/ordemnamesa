'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDesfazerExecucao } from '@/lib/hooks/use-execucoes';
import { useRestaurantStore } from '@/lib/store/restaurant-store';

export default function ConfirmacaoTarefaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = React.use(params);
    const router = useRouter();
    const { restaurantId } = useRestaurantStore();
    const { mutateAsync: desfazer, isPending } = useDesfazerExecucao();

    // No fluxo ideal, buscaríamos os detalhes exatos da execução (nome da task, timestamp real) a partir do ID gerado. 
    // Para renderização otimista agilizar, assumiremos os valores simulados de UX "agora".
    const dataAtualString = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit', minute: '2-digit'
    }).format(new Date());

    const handleUndo = async () => {
        if (!restaurantId) return;
        if (confirm('Tem certeza que deseja estornar e apagar este registro? (Isso só de pode ser feito em até 5min.)')) {
            try {
                await desfazer({ id, restaurantId: restaurantId });
                alert('Registro cancelado e excluído com sucesso.');
                router.replace('/turno');
            } catch (e: unknown) {
                alert((e as Error).message || 'Ocorreu um erro ao desfazer.');
            }
        }
    };

    return (
        <div className="min-h-screen bg-[#f6f8f8] dark:bg-[#101d22] font-display text-slate-900 dark:text-white flex flex-col items-center justify-center p-6 mx-auto max-w-[500px] w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Ícone Success com Neon/Glow */}
            <div className="flex flex-col items-center justify-center mb-8 relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full transform scale-150 opacity-40"></div>
                <div className="relative rounded-full bg-white dark:bg-[#182c20] border-4 border-primary/20 dark:border-primary/10 p-6 shadow-2xl shadow-primary/10">
                    <span className="material-symbols-outlined text-primary text-[80px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}>
                        check_circle
                    </span>
                </div>
            </div>

            <div className="text-center w-full mb-8">
                <h1 className="text-slate-900 dark:text-white tracking-tight text-[32px] font-bold leading-tight px-4 pb-2">Tarefa Concluída!</h1>
                <p className="text-slate-500 dark:text-slate-400 text-base font-normal leading-normal px-4">
                    A tarefa foi registrada <strong className="text-primary font-semibold">com sucesso</strong>.
                </p>
            </div>

            <div className="w-full flex items-center justify-between bg-white dark:bg-[#182c20] px-5 py-4 rounded-xl border-l-4 border-primary shadow-sm dark:shadow-md border border-gray-100 dark:border-transparent mb-8">
                <div className="flex items-center gap-4">
                    <div className="text-primary flex items-center justify-center rounded-lg bg-primary/10 shrink-0 size-12">
                        <span className="material-symbols-outlined">schedule</span>
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-0.5">Horário do Registro</p>
                        <p className="text-slate-900 dark:text-white text-lg font-semibold leading-tight">{dataAtualString} - Hoje</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 bg-primary/10 px-2 py-1 rounded text-primary text-xs font-bold">
                    <span className="material-symbols-outlined text-sm">cloud_done</span>
                    <span className="hidden sm:inline">Salvo</span>
                </div>
            </div>

            <div className="flex flex-col w-full gap-3 mt-auto">
                <button
                    onClick={() => router.push('/turno')}
                    className="w-full bg-primary hover:bg-[#0fd650] text-[#111e22] text-lg font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(19,236,91,0.2)] hover:shadow-[0_0_30px_rgba(19,236,91,0.4)] transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined">checklist</span>
                    Voltar ao Checklist
                </button>
                <button
                    onClick={handleUndo}
                    disabled={isPending}
                    className="w-full bg-transparent hover:bg-gray-100 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-base font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                    <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">undo</span>
                    {isPending ? 'Desfazendo...' : 'Desfazer registro'}
                </button>
            </div>
        </div>
    );
}
