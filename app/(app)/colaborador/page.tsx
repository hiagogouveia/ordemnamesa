import Link from "next/link";
import Image from "next/image";

export default function ColaboradorHome() {
    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Bom dia, Carlos!</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Terça-feira, 24 de Outubro • Turno da Manhã</p>
                </div>
            </div>

            {/* Alerts/Notifications */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 shadow-sm">
                <span className="material-symbols-outlined text-red-500 mt-0.5">error</span>
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-red-800 dark:text-red-400">Atenção Necessária</h3>
                    <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">
                        Existem 2 tarefas de abertura prioritárias atrasadas há mais de 30 minutos.
                    </p>
                </div>
                <button className="text-sm font-bold text-red-600 dark:text-red-400 hover:text-red-700 underline underline-offset-2">
                    Ver
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Content Column */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    {/* Stats / Progress */}
                    <div className="bg-gradient-to-br from-primary to-[#0ea5d6] rounded-2xl p-6 text-white shadow-lg shadow-primary/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                        <div className="relative z-10">
                            <h2 className="text-lg font-bold mb-1">Seu Progresso Hoje</h2>
                            <p className="text-blue-50 text-sm mb-6">Continue assim! Você está indo muito bem.</p>

                            <div className="flex items-end gap-4 mb-4">
                                <div className="text-5xl font-black tracking-tighter">8<span className="text-2xl font-bold text-blue-100">/12</span></div>
                                <div className="text-sm font-medium text-blue-100 pb-1">Tarefas<br />Concluídas</div>
                            </div>

                            <div className="w-full bg-black/20 rounded-full h-2 mb-2">
                                <div className="bg-white h-2 rounded-full" style={{ width: '66%' }}></div>
                            </div>
                            <div className="flex justify-between text-xs font-medium text-blue-100">
                                <span>0%</span>
                                <span>66%</span>
                                <span>100%</span>
                            </div>
                        </div>
                    </div>

                    {/* High Priority Tasks */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-orange-500 text-xl">bolt</span>
                                Prioridade Máxima
                            </h2>
                            <Link href="/colaborador/checklists" className="text-sm font-bold text-primary hover:text-primary/80 transition-colors">
                                Ver todas
                            </Link>
                        </div>

                        <div className="flex flex-col gap-3">
                            {/* Task Item 1 */}
                            <Link href="/colaborador/tarefa/1" className="group bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-4 hover:border-primary dark:hover:border-primary transition-all shadow-sm hover:shadow-md flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-500 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                                    <span className="material-symbols-outlined">thermometer</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Alta Prioridade</span>
                                        <span className="text-xs text-slate-500 dark:text-[#93adc8]">• 08:30</span>
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">Verificar Temperatura do Freezer Principal</h3>
                                    <p className="text-xs text-slate-500 dark:text-[#5a7b88] truncate">Cozinha Quente • Abertura</p>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">chevron_right</span>
                            </Link>

                            {/* Task Item 2 */}
                            <Link href="/colaborador/tarefa/2" className="group bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-4 hover:border-primary dark:hover:border-primary transition-all shadow-sm hover:shadow-md flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-500 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                                    <span className="material-symbols-outlined">cleaning_services</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Normal</span>
                                        <span className="text-xs text-slate-500 dark:text-[#93adc8]">• 09:00</span>
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">Higienizar Bancadas de Preparo</h3>
                                    <p className="text-xs text-slate-500 dark:text-[#5a7b88] truncate">Cozinha Quente • Abertura</p>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">chevron_right</span>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Sidebar Column */}
                <div className="flex flex-col gap-6">
                    {/* Quick Actions */}
                    <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Ação Rápida</h3>
                        <button className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#233f48] dark:hover:bg-[#2a4a55] text-slate-700 dark:text-white font-bold py-3 px-4 rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
                            Escanear Equipamento
                        </button>
                    </div>

                    {/* Team Status */}
                    <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Minha Equipe</h3>
                            <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded-full">3 Online</span>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-8 h-8 rounded-full bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/women/44.jpg')", backgroundSize: "cover" }}></div>
                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-surface-dark rounded-full"></span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">Mariana Costa</p>
                                    <p className="text-xs text-slate-500 dark:text-[#5a7b88]">Chefe de Salão</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-8 h-8 rounded-full bg-slate-200" style={{ backgroundImage: "url('https://randomuser.me/api/portraits/men/32.jpg')", backgroundSize: "cover" }}></div>
                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-surface-dark rounded-full"></span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">Pedro Santos</p>
                                    <p className="text-xs text-slate-500 dark:text-[#5a7b88]">Atendimento</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
