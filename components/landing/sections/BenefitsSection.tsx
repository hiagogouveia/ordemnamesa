import type { ReactNode } from "react";
import { Activity, History, Repeat, Smartphone, TrendingDown, Users } from "../icons";
import { Reveal } from "../Reveal";

interface Benefit {
  icon: ReactNode;
  title: string;
  text: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: <TrendingDown size={18} />,
    title: "Redução de erros",
    text: "Cada tarefa crítica é checada e registrada. Erros recorrentes somem.",
  },
  {
    icon: <Activity size={18} />,
    title: "Mais controle",
    text: "Visão em tempo real do que está acontecendo agora — em qualquer dispositivo.",
  },
  {
    icon: <Users size={18} />,
    title: "Equipe mais organizada",
    text: "Cada um sabe exatamente o que fazer. Sem confusão sobre responsabilidade.",
  },
  {
    icon: <Repeat size={18} />,
    title: "Menos retrabalho",
    text: "Padrão de execução elimina aquele “faz de novo” que custa tempo e dinheiro.",
  },
  {
    icon: <History size={18} />,
    title: "Histórico completo",
    text: "Auditoria pronta. Saiba quem fez o quê, quando — para sempre.",
  },
  {
    icon: <Smartphone size={18} />,
    title: "Funciona no celular",
    text: "100% mobile. A equipe usa onde já trabalha. Sem hardware novo.",
  },
];

const STATS = [
  { value: "−42%", label: "Retrabalho na operação" },
  { value: "98%", label: "Tarefas no padrão" },
  { value: "3h", label: "Economizadas por turno" },
  { value: "0", label: "Treinamento necessário" },
];

export function BenefitsSection() {
  return (
    <section id="beneficios" className="bg-surface-deep py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl mb-12 md:mb-16">
          <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            04 — Benefícios
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Resultado que{" "}
            <span className="italic font-light text-text-secondary">aparece no caixa</span>.
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Operação no padrão é menos retrabalho, menos perda e mais cliente satisfeito.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 mb-12 md:mb-16">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 50} className="h-full">
              <article className="h-full p-5 md:p-6 rounded-2xl bg-surface-dark/80 border border-border-dark hover:border-primary/40 transition-colors duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                    {b.icon}
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight">{b.title}</h3>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{b.text}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 rounded-2xl bg-surface-dark border border-border-dark overflow-hidden">
            {STATS.map((stat, i) => (
              <div
                key={stat.label}
                className={`p-6 md:p-8 text-center ${
                  i < STATS.length - 1 ? "md:border-r border-border-dark" : ""
                } ${i < 2 ? "border-b md:border-b-0 border-border-dark" : ""} ${
                  i % 2 === 0 ? "border-r md:border-r" : ""
                }`}
              >
                <div className="text-3xl md:text-4xl font-black tracking-tight text-primary mb-2">
                  {stat.value}
                </div>
                <div className="text-xs md:text-sm font-medium text-text-secondary uppercase tracking-widest">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
