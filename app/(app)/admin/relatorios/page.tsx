"use client";

import { useState } from "react";

export default function AdminRelatorios() {
    const [period, setPeriod] = useState("Últimos 7 dias");

    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Relatórios de Desempenho</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Análise detalhada de conformidade e equipe</p>
                </div>

                {/* Export Button */}
                <button className="w-full md:w-auto flex items-center justify-center gap-2 bg-white dark:bg-[#1a2c32] border border-slate-200 dark:border-[#325a67] hover:border-primary text-slate-700 dark:text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-all active:scale-[0.98]">
                    <span className="material-symbols-outlined text-[20px]">download</span>
                    Exportar CSV
                </button>
            </div>

            {/* Filter Toolbar */}
            <div className="flex gap-2 w-full overflow-x-auto pb-1 sm:pb-0">
                {['Hoje', 'Últimos 7 dias', 'Últimos 30 dias', 'Este Mês', 'Personalizado'].map((text) => (
                    <button
                        key={text}
                        onClick={() => setPeriod(text)}
                        className={`flex-shrink-0 px-4 py-2 text-sm font-bold rounded-lg transition-colors border ${period === text
                                ? 'bg-primary/10 border-primary text-primary dark:bg-primary/20'
                                : 'bg-white dark:bg-[#111e22] border-slate-200 dark:border-[#233f48] text-slate-600 dark:text-[#557682] hover:border-slate-300 dark:hover:border-[#3e525a] hover:text-slate-900 dark:hover:text-white'
                            }`}
                    >
                        {text}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart / Trend */}
                <div className="lg:col-span-2 bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] p-6 flex flex-col min-h-[400px]">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Conformidade Geral</h2>
                            <p className="text-xs text-slate-500 dark:text-[#557682]">Evolução do % de tarefas concluídas no prazo</p>
                        </div>
                        <button className="p-2 text-slate-400 hover:text-primary transition-colors">
                            <span className="material-symbols-outlined">more_vert</span>
                        </button>
                    </div>

                    {/* Chart Placeholder */}
                    <div className="flex-1 w-full bg-slate-50 dark:bg-[#152329] rounded-lg border border-slate-100 dark:border-[#1a2c32] flex items-center justify-center">
                        <div className="flex flex-col items-center text-slate-400 dark:text-[#325a67]">
                            <span className="material-symbols-outlined text-4xl mb-2">bar_chart</span>
                            <span className="text-sm font-medium">Gráfico de Linha (Conformidade 92%)</span>
                        </div>
                    </div>
                </div>

                {/* Sector Performance */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Por Setor</h2>
                    </div>

                    <div className="flex flex-col gap-5 flex-1 justify-center">
                        <div>
                            <div className="flex justify-between items-end mb-1.5">
                                <span className="text-sm font-bold text-slate-900 dark:text-white">Bar e Bebidas</span>
                                <span className="text-sm font-black text-green-600 dark:text-green-400">98%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-[#1a2c32] rounded-full h-2 overflow-hidden flex">
                                <div className="bg-green-500 h-full rounded-full" style={{ width: '98%' }}></div>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-end mb-1.5">
                                <span className="text-sm font-bold text-slate-900 dark:text-white">Salão Principal</span>
                                <span className="text-sm font-black text-blue-600 dark:text-blue-400">89%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-[#1a2c32] rounded-full h-2 overflow-hidden flex">
                                <div className="bg-blue-500 h-full rounded-full" style={{ width: '89%' }}></div>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-end mb-1.5">
                                <span className="text-sm font-bold text-slate-900 dark:text-white">Cozinha Quente</span>
                                <span className="text-sm font-black text-orange-600 dark:text-orange-400">75%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-[#1a2c32] rounded-full h-2 overflow-hidden flex">
                                <div className="bg-orange-500 h-full rounded-full" style={{ width: '75%' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Performers Table */}
            <div className="bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-[#233f48]">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Top Performance da Quinzena</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-[#233f48] bg-slate-50 dark:bg-[#152329]">
                                <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider">Colaborador</th>
                                <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider text-center">Tarefas Feitas</th>
                                <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider text-center">Pontualidade</th>
                                <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider text-right">Nota Geral</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#233f48]">
                            <tr className="hover:bg-slate-50 dark:hover:bg-[#1a2c32] transition-colors">
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/women/44.jpg')", backgroundSize: 'cover' }}></div>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">Mariana Costa</span>
                                    </div>
                                </td>
                                <td className="py-4 px-6 text-center">
                                    <span className="text-sm text-slate-900 dark:text-white font-medium">156</span>
                                </td>
                                <td className="py-4 px-6 text-center">
                                    <span className="text-sm text-slate-900 dark:text-white font-medium">99%</span>
                                </td>
                                <td className="py-4 px-6 text-right">
                                    <span className="inline-flex items-center justify-center bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 font-bold px-3 py-1 rounded-full text-sm">
                                        A+
                                    </span>
                                </td>
                            </tr>
                            <tr className="hover:bg-slate-50 dark:hover:bg-[#1a2c32] transition-colors">
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/men/32.jpg')", backgroundSize: 'cover' }}></div>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">Carlos Silva</span>
                                    </div>
                                </td>
                                <td className="py-4 px-6 text-center">
                                    <span className="text-sm text-slate-900 dark:text-white font-medium">142</span>
                                </td>
                                <td className="py-4 px-6 text-center">
                                    <span className="text-sm text-slate-900 dark:text-white font-medium">95%</span>
                                </td>
                                <td className="py-4 px-6 text-right">
                                    <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 font-bold px-3 py-1 rounded-full text-sm">
                                        A
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
