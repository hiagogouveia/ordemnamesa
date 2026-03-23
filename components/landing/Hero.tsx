import Link from "next/link";

export function Hero() {
  return (
    <header className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24 lg:pb-32">
      <div
        className="absolute -top-40 right-0 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        aria-hidden="true"
      >
        <div
          className="aspect-[1097/845] w-[68.5625rem] bg-gradient-to-tr from-primary to-[#0ea5d6] opacity-20"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center bg-[url('https://www.transparenttextures.com/patterns/food.png')] bg-repeat bg-[length:60px_60px] bg-center dark:bg-blend-overlay dark:bg-[#101d22]">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20 bg-primary/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              O fim do papel chegou
            </span>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white sm:text-6xl drop-shadow-sm">
            Checklists digitais para{" "}
            <span className="text-primary">restaurantes de excelência</span>.
          </h1>

          <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-[#93adc8]">
            Transforme aberturas, fechamentos e auditorias em processos rápidos
            e à prova de falhas. Controle a operação da sua cozinha direto do
            celular e economize horas da sua equipe.
          </p>

          <div className="mt-10 flex items-center justify-center gap-x-4">
            <Link href="/signup" className="rounded-lg bg-primary px-8 py-4 text-base font-bold text-white shadow-xl shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-1">
              Criar conta grátis por 30 dias
            </Link>
            <button className="rounded-lg bg-white dark:bg-[#1a2c32] px-8 py-4 text-base font-bold text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-[#293a41] hover:bg-gray-50 dark:hover:bg-[#233f48] transition-all">
              Agendar Demo
            </button>
          </div>
        </div>

        <div className="mt-16 sm:mt-24 w-full max-w-5xl mx-auto rounded-xl shadow-2xl overflow-hidden glass-panel border border-slate-200/50 dark:border-[#293a41]/50 bg-white/50 dark:bg-[#101d22]/50 backdrop-blur-sm p-2 group">
          <div className="rounded-lg overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent z-10 pointer-events-none"></div>
            <div className="w-full flex justify-center py-20 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-600">
                developer_board
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
