import { Instagram, WhatsApp } from "../icons";
import { Reveal } from "../Reveal";

const WHATSAPP_URL = "https://wa.me/5567991364767";
const INSTAGRAM_URL = "https://www.instagram.com/ordemnamesabr/";

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-surface-deep py-20 md:py-28">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(19,182,236,0.18) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 mb-5 text-xs font-mono uppercase tracking-widest text-primary">
            <span className="w-6 h-px bg-primary" />
            06 — Pare agora
            <span className="w-6 h-px bg-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Pare de apagar incêndio{" "}
            <span className="italic font-light text-primary">na sua operação.</span>
          </h2>
          <p className="mt-5 text-lg text-text-secondary max-w-2xl mx-auto">
            Em uma conversa rápida pelo WhatsApp, mostramos como o Ordem na Mesa se encaixa na rotina do
            seu restaurante — sem compromisso, sem cadastro.
          </p>

          <div className="mt-8 flex flex-wrap gap-3 sm:gap-4 justify-center">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-success text-white font-bold shadow-xl shadow-success/30 hover:bg-success/90 hover:scale-[1.02] transition-all duration-200"
            >
              <WhatsApp size={20} />
              Falar no WhatsApp
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-surface-dark border border-border-dark text-white font-bold hover:bg-surface-dark/70 hover:border-primary/40 transition-all duration-200"
            >
              <Instagram size={18} />
              Ver no Instagram
            </a>
          </div>

          <div className="mt-6 text-xs font-mono uppercase tracking-widest text-text-secondary">
            Resposta em minutos · Sem robôs
          </div>
        </Reveal>
      </div>
    </section>
  );
}
