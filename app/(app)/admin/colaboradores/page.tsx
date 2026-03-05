"use client";

export default function AdminColaboradores() {
    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Equipe</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Gerencie acessos e visualize desempenho da equipe</p>
                </div>

                <button className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-[#0ea5d6] text-white font-bold py-2.5 px-6 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
                    <span className="material-symbols-outlined text-[20px]">person_add</span>
                    Adicionar Membro
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#111e22] border border-slate-200 dark:border-[#233f48] rounded-xl p-4 shadow-sm">
                    <div className="text-slate-500 dark:text-[#557682] text-xs font-bold uppercase tracking-wider mb-2">Total Ativos</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">24</div>
                </div>
                <div className="bg-white dark:bg-[#111e22] border border-slate-200 dark:border-[#233f48] rounded-xl p-4 shadow-sm">
                    <div className="text-slate-500 dark:text-[#557682] text-xs font-bold uppercase tracking-wider mb-2">Agora Online</div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <div className="text-2xl font-black text-slate-900 dark:text-white">8</div>
                    </div>
                </div>
                <div className="bg-white dark:bg-[#111e22] border border-slate-200 dark:border-[#233f48] rounded-xl p-4 shadow-sm">
                    <div className="text-slate-500 dark:text-[#557682] text-xs font-bold uppercase tracking-wider mb-2">Turno Atual</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white text-base mt-2">Manhã</div>
                </div>
                <div className="bg-white dark:bg-[#111e22] border border-slate-200 dark:border-[#233f48] rounded-xl p-4 shadow-sm">
                    <div className="text-slate-500 dark:text-[#557682] text-xs font-bold uppercase tracking-wider mb-2">Avisos</div>
                    <div className="text-2xl font-black text-red-500">2</div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-2">
                <div className="relative group w-full sm:max-w-xs">
                    <div className="absolute left-0 top-0 bottom-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-[#557682] group-focus-within:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">search</span>
                    </div>
                    <input type="text" placeholder="Buscar colaborador..." className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border border-slate-200 dark:border-[#325a67] bg-white dark:bg-[#192d33] focus:border-primary dark:focus:border-primary h-10 placeholder:text-slate-400 dark:placeholder:text-[#5a7b88] pl-10 pr-4 text-sm font-normal leading-normal transition-all shadow-sm" />
                </div>
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <button className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-[#1a2c32] border border-slate-200 dark:border-[#325a67] text-slate-700 dark:text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Filtrar
                    </button>
                </div>
            </div>

            {/* Employees Table */}
            <div className="bg-white dark:bg-[#111e22] rounded-xl shadow-sm border border-slate-200 dark:border-[#233f48] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-[#233f48] bg-slate-50 dark:bg-[#152329]">
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider">Colaborador</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider">Setor</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider">Turno</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider">Status</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-[#557682] uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#233f48]">
                            <tr className="hover:bg-slate-50 dark:hover:bg-[#1a2c32] transition-colors group">
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/women/44.jpg')", backgroundSize: 'cover' }}></div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">Mariana Costa</span>
                                            <span className="text-xs text-slate-500 dark:text-[#93adc8]">Gerente de Salão</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="text-sm text-slate-600 dark:text-[#93adc8]">Salão Principal</span>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="text-sm text-slate-600 dark:text-[#93adc8]">Manhã/Tarde</span>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                        Online
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <button className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#233f48] hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined text-[20px]">more_vert</span>
                                    </button>
                                </td>
                            </tr>
                            <tr className="hover:bg-slate-50 dark:hover:bg-[#1a2c32] transition-colors group">
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/men/32.jpg')", backgroundSize: 'cover' }}></div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">Carlos Silva</span>
                                            <span className="text-xs text-slate-500 dark:text-[#93adc8]">Chefe de Cozinha</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="text-sm text-slate-600 dark:text-[#93adc8]">Cozinha Quente</span>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="text-sm text-slate-600 dark:text-[#93adc8]">Noite</span>
                                </td>
                                <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 dark:bg-[#233f48] dark:text-[#93adc8] text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                        Offline
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <button className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#233f48] hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined text-[20px]">more_vert</span>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
