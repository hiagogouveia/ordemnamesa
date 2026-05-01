import type { ReactNode } from "react";
import { AlertCircle, EyeOff, Megaphone, Repeat } from "../icons";
import { Reveal } from "../Reveal";

interface Problem {
  icon: ReactNode;
  title: string;
  text: string;
  quote: string;
}

const PROBLEMS: Problem[] = [
  {
    icon: <EyeOff size={22} />,
    title: "Funcionário esquece tarefa",
    text: "A chapa não foi limpa, o estoque não foi conferido, a mesa não foi montada. Você só descobre quando o problema explode.",
    quote: "“Achei que tinha sido feito.”",
  },
  {
    icon: <AlertCircle size={22} />,
    title: "Falta de padrão",
    text: "Cada funcionário faz do seu jeito. O que era para ser uma rotina vira improviso constante. Cada turno é uma surpresa.",
    quote: "“Foi assim que eu aprendi.”",
  },
  {
    icon: <Megaphone size={22} />,
    title: "Você precisa ficar cobrando",
    text: "Seu tempo vai embora repetindo as mesmas instruções. Você vira o lembrete humano da operação inteira.",
    quote: "“Já te falei isso umas dez vezes.”",
  },
  {
    icon: <Repeat size={22} />,
    title: "Falta de visibilidade",
    text: "Sem evidência, sem histórico. Quando algo dá errado, ninguém sabe quem fez o quê — e o retrabalho começa de novo.",
    quote: "“Quem é que ficou responsável mesmo?”",
  },
];

export function ProblemSection() {
  return (
    <section id="problema" className="relative bg-background-dark py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl mb-12 md:mb-16">
          <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            01 — O Problema
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Você reconhece <span className="italic font-light text-text-secondary">esses dias</span>?
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Todo dono de restaurante já passou por isso. A operação trava no detalhe que ninguém vê.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.title} delay={i * 30} className="h-full">
              <article className="h-full p-6 rounded-2xl bg-surface-dark border border-border-dark hover:border-primary/40 transition-colors duration-300">
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-4">
                  {p.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2 tracking-tight">{p.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed mb-4">{p.text}</p>
                <p className="text-sm italic text-text-secondary/70 border-l-2 border-primary/40 pl-3">
                  {p.quote}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
