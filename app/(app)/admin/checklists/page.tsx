"use client";

export default function AdminChecklists() {
    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Gestão de Checklists</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Crie e edite as rotinas da sua equipe</p>
                </div>

                <button className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-[#0ea5d6] text-white font-bold py-2.5 px-6 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
                    <span className="material-symbols-outlined text-[20px]">add</span>
                    Novo Checklist
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white dark:bg-[#111e22] p-4 rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48]">
                <div className="relative group w-full sm:max-w-md">
                    <div className="absolute left-0 top-0 bottom-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-[#557682] group-focus-within:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">search</span>
                    </div>
                    <input type="text" placeholder="Buscar checklist..." className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border border-slate-200 dark:border-[#325a67] bg-white dark:bg-[#192d33] focus:border-primary dark:focus:border-primary h-10 placeholder:text-slate-400 dark:placeholder:text-[#5a7b88] pl-10 pr-4 text-sm font-normal leading-normal transition-all shadow-sm" />
                </div>

                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <button className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-[#1a2c32] border border-slate-200 dark:border-[#325a67] hover:border-slate-300 dark:hover:border-primary text-slate-700 dark:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Todos os Setores
                    </button>
                    <button className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-[#1a2c32] border border-slate-200 dark:border-[#325a67] hover:border-slate-300 dark:hover:border-primary text-slate-700 dark:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">schedule</span>
                        Qualquer Turno
                    </button>
                </div>
            </div>

            {/* Checklists Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Card 1 */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] overflow-hidden group hover:border-primary dark:hover:border-primary transition-colors flex flex-col">
                    <div className="p-5 flex-1">
                        <div className="flex justify-between items-start mb-4">
                            <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 dark:bg-[#1a2c32] dark:text-[#93adc8] text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                Cozinha Quente
                            </span>
                            <button className="text-slate-400 hover:text-primary transition-colors">
                                <span className="material-symbols-outlined">more_vert</span>
                            </button>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary transition-colors">Abertura de Cozinha</h3>
                        <p className="text-sm text-slate-500 dark:text-[#5a7b88] mb-4">Checklist diário com verificação de termostatos e validade de insumos.</p>

                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-[#93adc8]">
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px]">task</span>
                                12 Tarefas
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                Turno Manhã
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-slate-100 dark:border-[#233f48] p-4 bg-slate-50 dark:bg-[#152329] flex justify-between items-center">
                        <div className="flex -space-x-2">
                            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-[#152329] bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/men/32.jpg')", backgroundSize: 'cover' }}></div>
                            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-[#152329] bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/women/44.jpg')", backgroundSize: 'cover' }}></div>
                            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-[#152329] bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                +3
                            </div>
                        </div>
                        <button className="text-sm font-bold text-primary hover:text-primary/80 transition-colors">
                            Editar
                        </button>
                    </div>
                </div>

                {/* Card 2 */}
                <div className="bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] overflow-hidden group hover:border-primary dark:hover:border-primary transition-colors flex flex-col">
                    <div className="p-5 flex-1">
                        <div className="flex justify-between items-start mb-4">
                            <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 dark:bg-[#1a2c32] dark:text-[#93adc8] text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                Salão Principal
                            </span>
                            <button className="text-slate-400 hover:text-primary transition-colors">
                                <span className="material-symbols-outlined">more_vert</span>
                            </button>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary transition-colors">Fechamento do Salão</h3>
                        <p className="text-sm text-slate-500 dark:text-[#5a7b88] mb-4">Organização de mesas, limpeza do chão e sangria de caixa.</p>

                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-[#93adc8]">
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px]">task</span>
                                24 Tarefas
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                Turno Noite
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-slate-100 dark:border-[#233f48] p-4 bg-slate-50 dark:bg-[#152329] flex justify-between items-center">
                        <div className="flex -space-x-2">
                            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-[#152329] bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/women/68.jpg')", backgroundSize: 'cover' }}></div>
                        </div>
                        <button className="text-sm font-bold text-primary hover:text-primary/80 transition-colors">
                            Editar
                        </button>
                    </div>
                </div>

                {/* New Checklist Card Placeholder */}
                <button className="bg-slate-50 dark:bg-[#152329] rounded-xl shadow-sm border-2 border-dashed border-slate-300 dark:border-[#325a67] p-6 flex flex-col items-center justify-center gap-4 hover:border-primary transition-colors group min-h-[250px]">
                    <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-[#233f48] flex items-center justify-center text-slate-400 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-3xl">add</span>
                    </div>
                    <span className="text-sm font-bold text-slate-600 dark:text-[#93adc8] group-hover:text-primary transition-colors">
                        Criar Novo Checklist
                    </span>
                </button>
            </div>
        </div>
    );
}
