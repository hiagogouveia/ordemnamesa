import type { ReactNode } from "react";
import { Activity, Camera, CheckSquare, History } from "../icons";
import { Reveal } from "../Reveal";

interface Pillar {
  icon: ReactNode;
  title: string;
  text: string;
}

const PILLARS: Pillar[] = [
  {
    icon: <CheckSquare size={26} />,
    title: "Checklists simples",
    text: "Crie rotinas por área, turno e função. A equipe abre o app e sabe exatamente o que fazer — sem treinamento longo.",
  },
  {
    icon: <Camera size={26} />,
    title: "Execução com foto",
    text: "Toda tarefa crítica é registrada com evidência fotográfica. Acabou o “achei que tinha feito”.",
  },
  {
    icon: <History size={26} />,
    title: "Histórico auditável",
    text: "Tudo fica registrado: quem fez, quando, com qual evidência. Você revisa o turno em segundos.",
  },
  {
    icon: <Activity size={26} />,
    title: "Gestão sem stress",
    text: "Painel em tempo real mostra o que está em dia, atrasado ou impedido. Você age antes do cliente reclamar.",
  },
];

export function SolutionSection() {
  return (
    <section id="solucao" className="relative overflow-hidden bg-surface-deep py-20 md:py-28">
      <div
        aria-hidden
        className="absolute -top-48 -left-48 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(19,182,236,0.18) 0%, transparent 60%)" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-48 -right-48 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(19,182,236,0.12) 0%, transparent 60%)" }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl mb-12 md:mb-16">
          <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            02 — A Solução
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Sua operação <span className="italic font-light text-text-secondary">no padrão</span>, todos os dias.
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Quatro pilares que transformam improviso em rotina e rotina em resultado.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 30} className="h-full">
              <article className="h-full p-6 rounded-2xl bg-surface-dark/80 backdrop-blur border border-border-dark hover:border-primary/60 hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/30 text-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/10">
                  {p.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2 tracking-tight">{p.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{p.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
