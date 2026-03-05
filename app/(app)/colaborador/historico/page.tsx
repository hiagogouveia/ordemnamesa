"use client";

import { Logo } from "@/components/ui/Logo";

export default function ColaboradorHistorico() {
    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Histórico de Tarefas</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Seu desempenho nos últimos 30 dias</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-[#93adc8] mb-2">
                        <span className="material-symbols-outlined text-sm">task_alt</span>
                        <span className="text-xs font-bold uppercase tracking-wider">Concluídas</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">342</div>
                </div>

                <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-[#93adc8] mb-2">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        <span className="text-xs font-bold uppercase tracking-wider">Pontualidade</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-2xl font-black text-slate-900 dark:text-white">95%</div>
                        <span className="text-xs font-medium text-green-500 bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded">+2%</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-[#93adc8] mb-2">
                        <span className="material-symbols-outlined text-sm">photo_library</span>
                        <span className="text-xs font-bold uppercase tracking-wider">Fotos Evidência</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">128</div>
                </div>

                <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-[#93adc8] mb-2">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        <span className="text-xs font-bold uppercase tracking-wider">Atrasos</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">18</div>
                </div>
            </div>

            {/* Toolbar (Search & Filter) */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-2">
                <div className="relative group w-full sm:max-w-xs">
                    <div className="absolute left-0 top-0 bottom-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary">
                        <span className="material-symbols-outlined text-[20px]">search</span>
                    </div>
                    <input type="text" placeholder="Buscar tarefa..." className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark focus:border-primary dark:focus:border-primary h-10 placeholder:text-slate-400 dark:placeholder:text-[#5a7b88] pl-10 pr-4 text-sm font-normal leading-normal transition-all shadow-sm" />
                </div>

                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <button className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark hover:border-slate-300 dark:hover:border-[#3e525a] text-slate-700 dark:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Filtrar
                    </button>
                    <button className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark hover:border-slate-300 dark:hover:border-[#3e525a] text-slate-700 dark:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                        Últimos 7 dias
                    </button>
                </div>
            </div>

            {/* Task List / Table Desktop */}
            <div className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-border-dark overflow-hidden">
                {/* Mobile View (Cards) */}
                <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-border-dark">
                    <div className="p-4 flex flex-col gap-2 relative">
                        <div className="flex justify-between items-start mb-1">
                            <span className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Concluída
                            </span>
                            <span className="text-xs font-medium text-slate-500 dark:text-[#93adc8]">Ontem, 08:45</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white pr-6">Conferir Estoque da Boqueta</h3>
                        <p className="text-xs text-slate-500 dark:text-[#5a7b88]">Cozinha Quente • Abertura</p>
                        <button className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                            <span className="material-symbols-outlined">more_vert</span>
                        </button>
                    </div>

                    {/* Note: In a real app we would map over data. Adding one more as example. */}
                    <div className="p-4 flex flex-col gap-2 relative">
                        <div className="flex justify-between items-start mb-1">
                            <span className="bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Atrasada
                            </span>
                            <span className="text-xs font-medium text-slate-500 dark:text-[#93adc8]">22 Out, 10:15</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white pr-6">Limpeza Profunda do Chão</h3>
                        <p className="text-xs text-slate-500 dark:text-[#5a7b88]">Salão Principal • Fechamento</p>
                    </div>
                </div>

                {/* Desktop View (Table) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-border-dark bg-slate-50/50 dark:bg-surface-dark/50">
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Tarefa</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Setor / Turno</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Data e Hora</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Status</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-border-dark">
                            <tr className="hover:bg-slate-50 dark:hover:bg-[#152329] transition-colors group">
                                <td className="py-3 px-4">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Conferir Estoque da Boqueta</p>
                                </td>
                                <td className="py-3 px-4">
                                    <p className="text-sm text-slate-600 dark:text-[#93adc8]">Cozinha Quente</p>
                                    <p className="text-xs text-slate-400 dark:text-[#5a7b88]">Abertura</p>
                                </td>
                                <td className="py-3 px-4">
                                    <p className="text-sm text-slate-900 dark:text-white">Ontem</p>
                                    <p className="text-xs text-slate-500 dark:text-[#5a7b88]">08:45</p>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                        Concluída
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <button className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-dark hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                                    </button>
                                </td>
                            </tr>

                            <tr className="hover:bg-slate-50 dark:hover:bg-[#152329] transition-colors group">
                                <td className="py-3 px-4">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Limpeza Profunda do Chão</p>
                                </td>
                                <td className="py-3 px-4">
                                    <p className="text-sm text-slate-600 dark:text-[#93adc8]">Salão Principal</p>
                                    <p className="text-xs text-slate-400 dark:text-[#5a7b88]">Fechamento</p>
                                </td>
                                <td className="py-3 px-4">
                                    <p className="text-sm text-slate-900 dark:text-white">22 de Out</p>
                                    <p className="text-xs text-slate-500 dark:text-[#5a7b88]">10:15 (Prev: 09:30)</p>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                        Atrasada (Feita)
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <button className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-dark hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-border-dark flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-[#93adc8]">Mostrando 1 a 10 de 342 tarefas</span>
                    <div className="flex gap-1">
                        <button className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 dark:border-border-dark text-slate-400 disabled:opacity-50" disabled>
                            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 dark:border-border-dark text-slate-700 dark:text-white hover:border-primary hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
