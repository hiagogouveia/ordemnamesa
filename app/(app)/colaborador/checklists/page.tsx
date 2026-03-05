import Link from "next/link";

export default function ColaboradorChecklists() {
    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 md:pb-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Checklist do Dia</h1>
                    <p className="text-slate-500 dark:text-[#93adc8]">Cozinha Quente • Abertura</p>
                </div>

                {/* Progress Pill */}
                <div className="flex items-center gap-3 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark px-4 py-2 rounded-full shadow-sm">
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">66% Concluído</span>
                        <span className="text-[10px] text-slate-500 dark:text-[#5a7b88]">8 de 12 tarefas</span>
                    </div>
                    <div className="w-10 h-10 rounded-full border-[3px] border-primary flex items-center justify-center text-primary font-bold text-xs" style={{ borderRightColor: 'transparent', transform: 'rotate(45deg)' }}>
                        <div style={{ transform: 'rotate(-45deg)' }}>8</div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200 dark:border-border-dark">
                <nav className="-mb-px flex gap-6" aria-label="Tabs">
                    <button className="border-primary text-primary border-b-2 py-4 px-1 text-sm font-bold flex items-center gap-2">
                        Pendentes
                        <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full">4</span>
                    </button>
                    <button className="border-transparent text-slate-500 dark:text-[#93adc8] hover:border-slate-300 dark:hover:border-[#3e525a] hover:text-slate-700 dark:hover:text-white border-b-2 py-4 px-1 text-sm font-medium transition-colors">
                        Concluídas
                    </button>
                </nav>
            </div>

            {/* Task List Phase 1 */}
            <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-lg">radio_button_unchecked</span>
                    Fase 1: Preparação Inicial
                </h2>

                <div className="flex flex-col gap-3">
                    <Link href="/colaborador/tarefa/1" className="bg-white dark:bg-surface-dark border-l-4 border-l-orange-500 border border-slate-200 dark:border-border-dark border-opacity-50 rounded-r-xl rounded-l-sm p-4 hover:bg-slate-50 dark:hover:bg-[#233f48] transition-all shadow-sm flex items-center gap-4">
                        <div className="w-6 h-6 rounded border-2 border-slate-300 dark:border-[#3e525a] flex items-center justify-center shrink-0"></div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Prioridade</span>
                                <span className="text-xs text-red-500 font-medium">Atrasada (30m)</span>
                            </div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">Ligar e Testar Equipamentos Pesados</h3>
                        </div>
                        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                    </Link>

                    <Link href="/colaborador/tarefa/2" className="bg-white dark:bg-surface-dark border-l-4 border-l-slate-300 dark:border-l-[#3e525a] border border-slate-200 dark:border-border-dark border-opacity-50 rounded-r-xl rounded-l-sm p-4 hover:bg-slate-50 dark:hover:bg-[#233f48] transition-all shadow-sm flex items-center gap-4">
                        <div className="w-6 h-6 rounded border-2 border-slate-300 dark:border-[#3e525a] flex items-center justify-center shrink-0"></div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">Checar Temperatura do Freezer Principal</h3>
                            <p className="text-xs text-slate-500 dark:text-[#5a7b88] mt-1 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                                Requer Foto
                            </p>
                        </div>
                        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
