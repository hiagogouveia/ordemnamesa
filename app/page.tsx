"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${isScrolled
          ? "bg-white dark:bg-[#101d22] shadow-sm border-b border-[#e7f0f3] dark:border-[#233f48]"
          : "bg-transparent"
        }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo width={32} height={32} />
            <span className={`text-xl font-black ${isScrolled ? 'text-slate-900 dark:text-white' : 'text-slate-900 dark:text-white'} hidden sm:block tracking-tight`}>
              Ordem na Mesa
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#por-que-sistema" className="text-sm font-semibold text-slate-600 dark:text-[#93adc8] hover:text-primary transition-colors">Benefícios</a>
            <a href="#como-funciona" className="text-sm font-semibold text-slate-600 dark:text-[#93adc8] hover:text-primary transition-colors">Como Funciona</a>
            <div className="flex items-center gap-4 border-l border-slate-200 dark:border-[#293a41] pl-8">
              <Link href="/login" className="text-sm font-bold text-slate-900 dark:text-white hover:text-primary transition-colors">
                Fazer Login
              </Link>
              <button className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                Criar Conta
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-4 md:hidden">
            <Link href="/login" className="text-sm font-bold text-primary">Login</Link>
            <button className="text-slate-900 dark:text-white p-2">
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24 lg:pb-32">
      <div className="absolute -top-40 right-0 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
        <div className="aspect-[1097/845] w-[68.5625rem] bg-gradient-to-tr from-primary to-[#0ea5d6] opacity-20"
          style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }}
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
            Checklists digitais para <span className="text-primary">restaurantes de excelência</span>.
          </h1>

          <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-[#93adc8]">
            Transforme aberturas, fechamentos e auditorias em processos rápidos e à prova de falhas. Controle a operação da sua cozinha direto do celular e economize horas da sua equipe.
          </p>

          <div className="mt-10 flex items-center justify-center gap-x-4">
            <button className="rounded-lg bg-primary px-8 py-4 text-base font-bold text-white shadow-xl shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-1">
              Começar Agora
            </button>
            <button className="rounded-lg bg-white dark:bg-[#1a2c32] px-8 py-4 text-base font-bold text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-[#293a41] hover:bg-gray-50 dark:hover:bg-[#233f48] transition-all">
              Agendar Demo
            </button>
          </div>
        </div>

        <div className="mt-16 sm:mt-24 w-full max-w-5xl mx-auto rounded-xl shadow-2xl overflow-hidden glass-panel border border-slate-200/50 dark:border-[#293a41]/50 bg-white/50 dark:bg-[#101d22]/50 backdrop-blur-sm p-2 group">
          <div className="rounded-lg overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent z-10 pointer-events-none"></div>
            <div className="w-full flex justify-center py-20 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-600">developer_board</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function ProblemSolution() {
  return (
    <section className="bg-slate-50 dark:bg-[#152329] py-16 sm:py-24" id="por-que-sistema">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Nós sabemos como a cozinha pode ser um caos.
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-[#93adc8] mb-8">
              Anotações perdidas, áreas mal higienizadas, e a incerteza de gerentes sobre a operação real. É hora de evoluir.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/10 p-8">
              <h3 className="relative text-xl font-bold text-red-800 dark:text-red-400 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined">close</span> Antes: Caos Analógico
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-red-800/80 dark:text-red-300/80">
                  <span className="material-symbols-outlined text-lg mt-0.5 shrink-0">sentiment_dissatisfied</span>
                  Pilhas de papel e checklists sujos ou perdidos na cozinha.
                </li>
                <li className="flex items-start gap-3 text-red-800/80 dark:text-red-300/80">
                  <span className="material-symbols-outlined text-lg mt-0.5 shrink-0">help</span>
                  Gestor não sabe se a tarefa foi realmente feita ou apenas marcada.
                </li>
              </ul>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-8 transition-all hover:border-primary/40 shadow-sm">
              <h3 className="relative text-xl font-bold text-primary mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined">check</span> Depois: Ordem na Mesa
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-slate-900 dark:text-white">
                  <span className="material-symbols-outlined text-lg mt-0.5 text-primary shrink-0">devices</span>
                  Tudo digital, limpo e acessível em qualquer dispositivo.
                </li>
                <li className="flex items-start gap-3 text-slate-900 dark:text-white">
                  <span className="material-symbols-outlined text-lg mt-0.5 text-primary shrink-0">visibility</span>
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

function CTASection() {
  return (
    <section className="relative py-20 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-primary/10 dark:bg-primary/5"></div>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
      <div className="relative mx-auto max-w-3xl text-center z-10">
        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-6">Pronto para organizar seu restaurante?</h2>
        <p className="text-lg text-slate-600 dark:text-[#93adc8] mb-10 max-w-2xl mx-auto">Junte-se a centenas de gestores que recuperaram o controle de suas operações.</p>
        <form className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto" onSubmit={(e) => e.preventDefault()}>
          <input
            className="flex-1 h-12 px-4 rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            placeholder="Seu melhor e-mail profissional" type="email" />
          <button
            className="h-12 px-8 rounded-lg bg-primary text-white font-bold hover:bg-primary/90 shadow-lg shadow-primary/25 whitespace-nowrap"
            type="button">
            Solicitar Demo
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-600 dark:text-slate-500">Sem compromisso. Não é necessário cartão de crédito.</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-white dark:bg-[#0d181b] border-t border-[#e7f0f3] dark:border-slate-800 pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Logo width={24} height={24} />
              <span className="text-lg font-bold text-slate-900 dark:text-white">Ordem na Mesa</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-500 mb-4">Tecnologia para quem alimenta o mundo.</p>
          </div>
        </div>
        <div className="border-t border-[#e7f0f3] dark:border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-600 dark:text-slate-500">
          <p>© 2024 Ordem na Mesa. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <ProblemSolution />
      <CTASection />
      <Footer />
    </main>
  );
}
