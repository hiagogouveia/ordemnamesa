export function ProblemSolution() {
  return (
    <section
      className="bg-slate-50 dark:bg-[#152329] py-16 sm:py-24"
      id="por-que-sistema"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Nós sabemos como a cozinha pode ser um caos.
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-[#93adc8] mb-8">
              Anotações perdidas, áreas mal higienizadas, e a incerteza de
              gerentes sobre a operação real. É hora de evoluir.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/10 p-8">
              <h3 className="relative text-xl font-bold text-red-800 dark:text-red-400 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined">close</span> Antes:
                Caos Analógico
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-red-800/80 dark:text-red-300/80">
                  <span className="material-symbols-outlined text-lg mt-0.5 shrink-0">
                    sentiment_dissatisfied
                  </span>
                  Pilhas de papel e checklists sujos ou perdidos na cozinha.
                </li>
                <li className="flex items-start gap-3 text-red-800/80 dark:text-red-300/80">
                  <span className="material-symbols-outlined text-lg mt-0.5 shrink-0">
                    help
                  </span>
                  Gestor não sabe se a tarefa foi realmente feita ou apenas
                  marcada.
                </li>
              </ul>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-8 transition-all hover:border-primary/40 shadow-sm">
              <h3 className="relative text-xl font-bold text-primary mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined">check</span> Depois:
                Ordem na Mesa
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-slate-900 dark:text-white">
                  <span className="material-symbols-outlined text-lg mt-0.5 text-primary shrink-0">
                    devices
                  </span>
                  Tudo digital, limpo e acessível em qualquer dispositivo.
                </li>
                <li className="flex items-start gap-3 text-slate-900 dark:text-white">
                  <span className="material-symbols-outlined text-lg mt-0.5 text-primary shrink-0">
                    visibility
                  </span>
                  Monitoramento em tempo real de quem fez o quê e quando.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
