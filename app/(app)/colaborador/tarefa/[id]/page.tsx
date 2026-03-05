"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TarefaDetalhe() {
    const router = useRouter();

    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-24 md:pb-6 max-w-2xl mx-auto">
            {/* Mobile Top App Bar with Back Button */}
            <div className="md:hidden flex items-center gap-3 pt-2 pb-4 border-b border-slate-200 dark:border-border-dark">
                <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-surface-dark text-slate-600 dark:text-white">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Detalhes da Tarefa</h1>
            </div>

            {/* Desktop Breadcrumbs */}
            <nav className="hidden md:flex text-sm font-medium text-slate-500 dark:text-[#93adc8] mb-2">
                <Link href="/colaborador/checklists" className="hover:text-primary transition-colors">Checklists</Link>
                <span className="mx-2 material-symbols-outlined text-[18px]">chevron_right</span>
                <span className="text-slate-900 dark:text-white">Abertura de Caixa</span>
            </nav>

            {/* Task Header */}
            <div className="bg-white dark:bg-surface-dark rounded-xl p-6 shadow-sm border border-slate-200 dark:border-border-dark">
                <div className="flex items-center gap-2 mb-3">
                    <span className="bg-slate-100 text-slate-700 dark:bg-[#233f48] dark:text-[#93adc8] text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Cozinha Quente</span>
                    <span className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Normal</span>
                </div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2 leading-tight">Checar Temperatura do Freezer Principal</h1>
                <p className="text-slate-600 dark:text-[#5a7b88] text-sm">
                    Verifique se a temperatura está entre -18°C e -22°C. Registre uma foto clara do termostato.
                </p>
            </div>

            {/* Photo Upload Area */}
            <div className="bg-white dark:bg-surface-dark rounded-xl p-6 shadow-sm border border-slate-200 dark:border-border-dark">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Prova de Execução</h3>
                    <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-1 rounded uppercase">Obrigatório</span>
                </div>

                {/* Drag & Drop Zone */}
                <label className="group relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 dark:border-border-dark rounded-xl cursor-pointer bg-slate-50 dark:bg-[#1a2c32]/50 hover:bg-slate-100 dark:hover:bg-[#1a2c32] hover:border-primary transition-all duration-300">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                        <div className="mb-3 p-3 rounded-full bg-slate-200 dark:bg-[#233f48] group-hover:bg-primary/20 transition-colors">
                            <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-primary">add_a_photo</span>
                        </div>
                        <p className="mb-2 text-sm text-slate-500 dark:text-gray-300 font-medium">
                            <span className="font-semibold text-primary">Clique para fotografar</span> ou arraste
                        </p>
                        <p className="text-xs text-slate-400 dark:text-gray-500">PNG, JPG ou JPEG (MAX. 10MB)</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" capture="environment" />
                </label>

                <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-surface-dark border border-blue-100 dark:border-[#233f48]">
                    <span className="material-symbols-outlined text-primary text-sm mt-0.5">info</span>
                    <p className="text-xs text-slate-600 dark:text-[#93adc8]">
                        A foto deve mostrar as prateleiras organizadas e o chão limpo.
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="bg-white dark:bg-surface-dark rounded-xl p-6 shadow-sm border border-slate-200 dark:border-border-dark">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Ações</h3>
                <div className="flex flex-col gap-3">
                    <button onClick={() => router.push('/colaborador/checklists')} className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-[#0ea5d6] text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
                        <span className="material-symbols-outlined">check_circle</span>
                        Concluir Tarefa
                    </button>
                    <button className="flex items-center justify-center gap-2 w-full bg-transparent hover:bg-slate-50 dark:hover:bg-[#1a2c32] text-slate-600 dark:text-[#93adc8] border border-slate-200 dark:border-border-dark font-medium py-3 px-4 rounded-xl transition-all">
                        <span className="material-symbols-outlined">report_problem</span>
                        Reportar Problema
                    </button>
                </div>
            </div>
        </div>
    );
}
