"use client";

import { X } from "@/components/landing/icons";
import type { DemoStepConfig } from "../_types/demo.types";

interface DemoOverlayProps {
  step: DemoStepConfig;
  current: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExit: () => void;
  isLast: boolean;
}

/**
 * Overlay com tooltip explicativo + navegação do walkthrough.
 *
 * Estratégia mobile-first:
 *  - Tooltip ancorado no rodapé (não precisa cálculo de posição relativo a DOM).
 *  - Backdrop escuro leve, sem backdrop-filter pesado.
 *  - Botões grandes e acessíveis (>= 44px de toque).
 *  - Não bloqueia interação com o conteúdo central (pointer-events-none na base).
 */
export function DemoOverlay({
  step,
  current,
  total,
  onNext,
  onBack,
  onSkip,
  onExit,
  isLast,
}: DemoOverlayProps) {
  const showBack = step.showBack ?? current > 1;
  const primaryLabel =
    step.primaryLabel ?? (isLast ? "Finalizar" : "Próximo");

  return (
    <>
      {/* Botão "Sair" fixo no topo direito (sempre disponível) */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Sair da demonstração"
        className="fixed top-3 right-3 sm:top-5 sm:right-5 z-30
                   w-10 h-10 rounded-full
                   bg-white/5 hover:bg-white/10 border border-white/10
                   text-text-secondary hover:text-white
                   flex items-center justify-center
                   transition-colors backdrop-blur-sm"
      >
        <X size={18} />
      </button>

      {/* Progress dots no topo */}
      <div className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`block h-1 rounded-full transition-all duration-300 ${
              n === current
                ? "w-6 bg-primary"
                : n < current
                  ? "w-2 bg-primary/50"
                  : "w-2 bg-white/15"
            }`}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Card de tooltip ancorado no rodapé */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="demo-step-title"
        className="fixed bottom-0 inset-x-0 z-30 px-3 pb-3 sm:px-6 sm:pb-6 pointer-events-none"
      >
        <div
          className="pointer-events-auto mx-auto max-w-2xl rounded-2xl
                     bg-[#0e1a20]/95 backdrop-blur-md
                     border border-white/10
                     shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.6)]
                     p-4 sm:p-5"
        >
          {/* Kicker */}
          {step.kicker ? (
            <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-primary mb-1.5">
              {step.kicker}
            </div>
          ) : null}

          {/* Title */}
          <h2
            id="demo-step-title"
            className="text-lg sm:text-xl font-bold text-white tracking-tight mb-1.5"
          >
            {step.title}
          </h2>

          {/* Description */}
          <p className="text-[13px] sm:text-sm text-text-secondary leading-relaxed mb-4">
            {step.description}
          </p>

          {/* Navigation */}
          <div className="flex items-center gap-2.5">
            {showBack ? (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2.5 rounded-lg text-[13px] font-semibold
                           text-text-secondary hover:text-white
                           border border-white/10 hover:border-white/20
                           transition-colors"
              >
                Voltar
              </button>
            ) : null}

            {/* Skip — visível apenas durante o walkthrough (não no passo final) */}
            {!isLast ? (
              <button
                type="button"
                onClick={onSkip}
                className="hidden sm:inline-flex px-4 py-2.5 rounded-lg text-[13px] font-semibold
                           text-text-secondary hover:text-white transition-colors"
              >
                Pular demonstração
              </button>
            ) : null}

            <div className="flex-1" />

            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center justify-center gap-2
                         px-5 py-2.5 rounded-lg
                         bg-success hover:bg-success/90
                         text-white text-[13px] font-bold tracking-tight
                         shadow-lg shadow-success/20
                         transition-all hover:translate-y-[-1px]"
            >
              {primaryLabel}
              {!isLast ? <span aria-hidden="true">→</span> : null}
            </button>
          </div>

          {/* Skip mobile — abaixo dos botões */}
          {!isLast ? (
            <div className="sm:hidden mt-2.5 text-center">
              <button
                type="button"
                onClick={onSkip}
                className="text-[12px] font-semibold text-text-secondary hover:text-white transition-colors"
              >
                Pular demonstração
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
