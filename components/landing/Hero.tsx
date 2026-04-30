import type { ReactNode } from "react";
import { Camera, Check, Instagram, WhatsApp } from "./icons";

const WHATSAPP_URL = "https://wa.me/5567991364767";
const INSTAGRAM_URL = "https://www.instagram.com/ordemnamesabr/";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-surface-deep pt-28 md:pt-36 pb-16 md:pb-24">
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(19,182,236,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(19,182,236,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(19,182,236,0.2) 0%, transparent 60%)" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 60%)" }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center gap-2 mb-6 text-xs font-mono uppercase tracking-widest text-primary">
            <span className="w-6 h-px bg-primary" />
            Em tempo real
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[1.05] text-white">
            Seu restaurante <br className="hidden sm:block" />
            rodando no padrão.
            <br />
            <span className="italic font-light text-text-secondary">Todos os dias. Sem falhas.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-text-secondary max-w-xl leading-relaxed">
            Checklists com evidência fotográfica e histórico auditável. Controle sua cozinha direto do
            celular e economize horas da sua equipe.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-success text-white font-bold shadow-xl shadow-success/30 hover:bg-success/90 hover:scale-[1.02] transition-all duration-200"
            >
              <WhatsApp size={22} />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Fale agora</span>
                <span className="text-base font-bold">WhatsApp</span>
              </span>
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-surface-dark border border-border-dark text-white font-bold hover:bg-surface-dark/70 hover:border-primary/40 hover:scale-[1.02] transition-all duration-200"
            >
              <Instagram size={20} />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Siga em</span>
                <span className="text-base font-bold">Instagram</span>
              </span>
            </a>
          </div>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}

function PhoneMockup() {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[60px] blur-3xl opacity-50 pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(19,182,236,0.3) 0%, transparent 70%)" }}
      />

      <div className="relative w-[280px] h-[580px] rounded-[48px] bg-gradient-to-b from-surface-dark to-surface-deep border border-border-dark shadow-2xl">
        <div className="absolute inset-2 rounded-[40px] bg-surface-deep overflow-hidden">
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-24 h-7 bg-black rounded-full z-30 flex items-center justify-end pr-2">
            <span className="block w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          </div>

          <div className="pt-12 px-5 pb-8 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest font-bold text-text-secondary">Hoje</span>
                <span className="text-base font-bold text-white tracking-tight">Cozinha · Manhã</span>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-text-secondary">
                JS
              </div>
            </div>

            <div className="relative w-40 h-40 mx-auto mb-6 drop-shadow-xl">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 176 176">
                <circle cx="88" cy="88" r={radius} fill="none" stroke="rgba(125,218,246,0.08)" strokeWidth="12" />
                <circle
                  cx="88"
                  cy="88"
                  r={radius}
                  fill="none"
                  stroke="#13b6ec"
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * 0.02}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-white tracking-tight">98</span>
                <span className="text-[8px] uppercase tracking-widest font-bold text-primary/60 mt-1">
                  Tarefas no padrão
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <TaskRow color="primary" />
              <TaskRow color="success" />
            </div>

            <div className="mt-auto mx-auto w-28 h-1 bg-white/20 rounded-full" />
          </div>
        </div>
      </div>

      <FloatingBadge
        position="top-12 -left-16 sm:-left-20"
        accent="primary"
        icon={<Camera size={18} />}
        title="Foto enviada"
        subtitle="Chapa limpa · 08:42"
      />
      <FloatingBadge
        position="bottom-20 -right-16 sm:-right-20"
        accent="success"
        icon={<Check size={18} />}
        title="12 tarefas no padrão"
        subtitle="Turno completo"
      />
    </div>
  );
}

function TaskRow({ color }: { color: "primary" | "success" }) {
  const colorMap = {
    primary: "bg-primary/15 border-primary/20 text-primary",
    success: "bg-success/15 border-success/20 text-success",
  } as const;
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-dark/60 border border-border-dark/60">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
        <Check size={14} />
      </div>
      <div className="flex-1 space-y-1.5">
        <div className="h-2 w-20 rounded-full bg-text-secondary/60" />
        <div className="h-1.5 w-12 rounded-full bg-text-secondary/30" />
      </div>
    </div>
  );
}

interface FloatingBadgeProps {
  position: string;
  accent: "primary" | "success";
  icon: ReactNode;
  title: string;
  subtitle: string;
}

function FloatingBadge({ position, accent, icon, title, subtitle }: FloatingBadgeProps) {
  const accentMap = {
    primary: "from-primary/30 to-primary/5 border-primary/30 text-primary",
    success: "from-success/30 to-success/5 border-success/30 text-success",
  } as const;

  return (
    <div
      className={`hidden md:flex absolute ${position} items-center gap-3 p-3 rounded-2xl bg-surface-dark/90 backdrop-blur border border-border-dark shadow-xl z-20`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-b ${accentMap[accent]} border`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-white tracking-tight whitespace-nowrap">{title}</p>
        <p className="text-[11px] font-medium text-text-secondary whitespace-nowrap">{subtitle}</p>
      </div>
    </div>
  );
}
