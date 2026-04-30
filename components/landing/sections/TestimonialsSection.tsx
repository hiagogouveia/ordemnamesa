import { Star } from "../icons";
import { Reveal } from "../Reveal";

interface Testimonial {
  name: string;
  role: string;
  initials: string;
  quote: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Marcos Almeida",
    role: "Dono · Burguer House",
    initials: "MA",
    quote:
      "Antes eu chegava no restaurante e ficava 1 hora só conferindo. Hoje abro o app, vejo tudo, e parto pro que importa.",
  },
  {
    name: "Renata Oliveira",
    role: "Gerente · Cantina da Renata",
    initials: "RO",
    quote:
      "A equipe parou de me perguntar “o que tenho que fazer?”. Cada um sabe a rotina dele. Mudou o clima do salão.",
  },
  {
    name: "Felipe Costa",
    role: "Sócio · Pizzaria Don Felipe",
    initials: "FC",
    quote:
      "O histórico com foto resolveu nossa briga interna. Quando dá problema, eu vejo exatamente o que aconteceu, sem achismo.",
  },
];

export function TestimonialsSection() {
  return (
    <section id="depoimentos" className="bg-background-dark py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl mb-12 md:mb-16">
          <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            05 — Depoimentos
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Quem já <span className="italic font-light text-text-secondary">colocou ordem</span> na mesa.
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Donos e gerentes que pararam de apagar incêndio.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 80} className="h-full">
              <article className="h-full flex flex-col p-6 md:p-7 rounded-2xl bg-surface-dark border border-border-dark hover:border-primary/40 transition-colors duration-300">
                <div className="flex gap-1 text-primary mb-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={14} />
                  ))}
                </div>
                <p className="text-base text-white leading-relaxed mb-6 flex-1">“{t.quote}”</p>
                <div className="flex items-center gap-3 pt-4 border-t border-border-dark">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/30 flex items-center justify-center text-sm font-bold text-white">
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{t.name}</div>
                    <div className="text-xs text-text-secondary">{t.role}</div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
