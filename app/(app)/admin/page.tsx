"use client";

import { useState } from "react";

export default function AdminDashboard() {
    const [filterPeriod, setFilterPeriod] = useState("Hoje");

    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard Operacional</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Visão geral da unidade em tempo real</p>
                </div>

                {/* Date Filter */}
                <div className="flex bg-slate-100 dark:bg-[#1a2c32] p-1 rounded-lg w-full md:w-auto">
                    {['Hoje', 'Esta Semana', 'Este Mês'].map((period) => (
                        <button
                            key={period}
                            onClick={() => setFilterPeriod(period)}
                            className={`flex-1 md:flex-none px-4 py-1.5 text-sm font-bold rounded-md transition-all ${filterPeriod === period
                                    ? 'bg-white dark:bg-[#233f48] text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-[#557682] hover:text-slate-700 dark:hover:text-white'
                                }`}
                        >
                            {period}
                        </button>
                    ))}
                </div>
            </div>

            {/* Critical Alert */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 shadow-sm animate-pulse-subtle">
                <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-red-500 mt-0.5">error</span>
                    <div>
                        <h3 className="text-sm font-bold text-red-800 dark:text-red-400">Atenção Prioritária (Atrasos)</h3>
                        <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">
                            Existem <strong>3 tarefas críticas</strong> de abertura pendentes na Cozinha Quente.
                        </p>
                    </div>
                </div>
                <button className="whitespace-nowrap w-full sm:w-auto px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-800 dark:text-red-300 text-sm font-bold rounded-lg transition-colors">
                    Ver Detalhes
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                {/* KPI 1 */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl p-5 shadow-sm border border-slate-200 dark:border-[#233f48] relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-primary/5 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-500 flex items-center justify-center">
                            <span className="material-symbols-outlined">pending_actions</span>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10 px-2 py-1 rounded-full">
                            12
                        </span>
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">34</h3>
                        <p className="text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Tarefas Pendentes</p>
                    </div>
                </div>

                {/* KPI 2 */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl p-5 shadow-sm border border-slate-200 dark:border-[#233f48] relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-500/5 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-500 flex items-center justify-center">
                            <span className="material-symbols-outlined">photo_camera</span>
                        </div>
                        <span className="text-xs font-bold text-slate-500 dark:text-[#557682]">+5 hoje</span>
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">8</h3>
                        <p className="text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Fotos p/ revisão</p>
                    </div>
                </div>

                {/* KPI 3 */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl p-5 shadow-sm border border-slate-200 dark:border-[#233f48] relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-green-500/5 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-500 flex items-center justify-center">
                            <span className="material-symbols-outlined">timer</span>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/10 px-2 py-1 rounded-full">
                            <span className="material-symbols-outlined text-[12px]">trending_up</span> 4%
                        </span>
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">92%</h3>
                        <p className="text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Pontualidade (Hoje)</p>
                    </div>
                </div>

                {/* KPI 4 */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl p-5 shadow-sm border border-slate-200 dark:border-[#233f48] relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-purple-500/5 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-purple-500 flex items-center justify-center">
                            <span className="material-symbols-outlined">group</span>
                        </div>
                        <span className="text-xs font-bold text-slate-500 dark:text-[#557682]">de 12 online</span>
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">8</h3>
                        <p className="text-xs font-bold text-slate-500 dark:text-[#93adc8] uppercase tracking-wider">Equipe Logada</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart / Progress Area */}
                <div className="lg:col-span-2 bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Status por Setor</h2>
                        <button className="text-slate-400 hover:text-primary transition-colors">
                            <span className="material-symbols-outlined">more_horiz</span>
                        </button>
                    </div>

                    <div className="flex flex-col gap-6">
                        {/* Sector 1 */}
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#1a2c32] flex items-center justify-center text-slate-600 dark:text-[#93adc8]">
                                        <span className="material-symbols-outlined text-[18px]">restaurant</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cozinha Quente</h3>
                                        <p className="text-xs text-slate-500 dark:text-[#557682]">18 tarefas (3 atrasadas)</p>
                                    </div>
                                </div>
                                <span className="text-sm font-black text-slate-900 dark:text-white">45%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-[#1a2c32] rounded-full h-2.5 overflow-hidden flex">
                                <div className="bg-primary h-full rounded-l-full" style={{ width: '45%' }}></div>
                                <div className="bg-red-500 h-full" style={{ width: '15%' }}></div>
                            </div>
                        </div>

                        {/* Sector 2 */}
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#1a2c32] flex items-center justify-center text-slate-600 dark:text-[#93adc8]">
                                        <span className="material-symbols-outlined text-[18px]">local_bar</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Bar e Bebidas</h3>
                                        <p className="text-xs text-slate-500 dark:text-[#557682]">12 tarefas</p>
                                    </div>
                                </div>
                                <span className="text-sm font-black text-slate-900 dark:text-white">80%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-[#1a2c32] rounded-full h-2.5 overflow-hidden flex">
                                <div className="bg-primary h-full rounded-l-full" style={{ width: '80%' }}></div>
                            </div>
                        </div>

                        {/* Sector 3 */}
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#1a2c32] flex items-center justify-center text-slate-600 dark:text-[#93adc8]">
                                        <span className="material-symbols-outlined text-[18px]">storefront</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Salão Principal</h3>
                                        <p className="text-xs text-slate-500 dark:text-[#557682]">24 tarefas</p>
                                    </div>
                                </div>
                                <span className="text-sm font-black text-slate-900 dark:text-white">25%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-[#1a2c32] rounded-full h-2.5 overflow-hidden flex">
                                <div className="bg-primary h-full rounded-l-full" style={{ width: '25%' }}></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Last Activities List */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] p-6 flex flex-col h-full">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Atividade Recente</h2>
                        <button className="text-xs font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider">
                            Ver Tudo
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col gap-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-[#233f48] before:to-transparent">

                        {/* Activity 1 */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-[#111e22] bg-green-100 text-green-500 dark:bg-green-500/20 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                                <span className="material-symbols-outlined text-[18px]">check</span>
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-50 dark:bg-[#1a2c32] p-3 rounded-lg border border-slate-200 dark:border-[#233f48] shadow-sm">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">Revisão de Caixa</span>
                                    <span className="text-[10px] font-medium text-slate-500 dark:text-[#93adc8]">Agora</span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-[#5a7b88]">Por Mariana Costa (Aprovado)</p>
                            </div>
                        </div>

                        {/* Activity 2 */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-[#111e22] bg-blue-100 text-blue-500 dark:bg-blue-500/20 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                                <span className="material-symbols-outlined text-[18px]">image</span>
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-50 dark:bg-[#1a2c32] p-3 rounded-lg border border-slate-200 dark:border-[#233f48] shadow-sm">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">Foto Adicionada</span>
                                    <span className="text-[10px] font-medium text-slate-500 dark:text-[#93adc8]">Há 5m</span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-[#5a7b88]">Carlos fez upload p/ &quot;Limpeza do Chão&quot;</p>
                            </div>
                        </div>

                        {/* Activity 3 */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-[#111e22] bg-orange-100 text-orange-500 dark:bg-orange-500/20 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                                <span className="material-symbols-outlined text-[18px]">schedule</span>
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-50 dark:bg-[#1a2c32] p-3 rounded-lg border border-slate-200 dark:border-[#233f48] shadow-sm">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">Tarefa Atrasada</span>
                                    <span className="text-[10px] font-medium text-slate-500 dark:text-[#93adc8]">Há 15m</span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-[#5a7b88]">Salão Principal (Abertura)</p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
