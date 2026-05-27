"use client";

import type { ReactNode } from "react";

/**
 * Container visual de um passo — palco onde o conteúdo da demo é renderizado.
 *
 * Em vez de cálculo complexo de spotlight sobre o DOM, usamos um padrão
 * "stage centralizado": o conteúdo do passo é o ponto focal natural,
 * destacado por uma sombra ambiente suave e contraste com o backdrop escuro.
 *
 * Vantagens:
 *  - Zero cálculo de posição em runtime (estável em mobile)
 *  - Sem refs frágeis ou ResizeObserver
 *  - Layout previsível em qualquer viewport
 *
 * Versão sóbria: sem ring azul vibrante, sem blur exagerado — apenas uma
 * sombra ambiente petróleo bem dosada (sensação "SaaS premium" e não "neon").
 */
export function DemoStep({
  emphasize = true,
  children,
}: {
  /** Quando true, aplica sombra ambient sutil ao redor do conteúdo */
  emphasize?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative w-full transition-all duration-500 ${
        emphasize
          ? "drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
          : "drop-shadow-none"
      }`}
    >
      {emphasize ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 sm:-inset-10 rounded-[36px]
                     bg-[radial-gradient(ellipse_at_center,rgba(20,55,80,0.35)_0%,transparent_60%)]
                     blur-2xl"
        />
      ) : null}

      <div className="relative">{children}</div>
    </div>
  );
}
