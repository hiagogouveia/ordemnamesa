"use client";

export function CTASection() {
  return (
    <section className="relative py-20 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-primary/10 dark:bg-primary/5"></div>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
      <div className="relative mx-auto max-w-3xl text-center z-10">
        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-6">
          Pronto para organizar seu restaurante?
        </h2>
        <p className="text-lg text-slate-600 dark:text-[#93adc8] mb-10 max-w-2xl mx-auto">
          Junte-se a centenas de gestores que recuperaram o controle de suas
          operações.
        </p>
        <form
          className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            className="flex-1 h-12 px-4 rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            placeholder="Seu melhor e-mail profissional"
            type="email"
          />
          <button
            className="h-12 px-8 rounded-lg bg-primary text-white font-bold hover:bg-primary/90 shadow-lg shadow-primary/25 whitespace-nowrap"
            type="button"
          >
            Solicitar Demo
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-600 dark:text-slate-500">
          Sem compromisso. Não é necessário cartão de crédito.
        </p>
      </div>
    </section>
  );
}
