"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Imagem da evidência fotográfica do walkthrough.
 *
 * Filosofia (v4 — final):
 *   - Abandona SVG ilustrativo. A "foto" é uma imagem JPG/PNG real
 *     colocada em `public/demo/evidencia.jpg`.
 *   - Usa `next/image` (otimização automática: WebP/AVIF, lazy loading,
 *     responsive sizes, cache headers).
 *   - Fallback gracioso: enquanto o arquivo não existir OU se falhar
 *     ao carregar, exibe um gradiente dark cinematográfico — a UI dos
 *     overlays continua legível, sem quebrar a demo.
 *
 * Como trocar a imagem:
 *   1. Salve sua foto como `public/demo/evidencia.jpg`
 *   2. Recarregue a página — pronto.
 *
 * Os overlays (badge ENVIADA, GPS verificado, timestamp, autor, viewfinder
 * brackets) ficam em `DemoContent.tsx → EvidenceContent` e são aplicados
 * por cima desta imagem sem qualquer alteração.
 */

const EVIDENCE_IMAGE_SRC = "/demo/evidencia.jpg";

export function DemoMockPhoto({ className = "" }: { className?: string }) {
  const [errored, setErrored] = useState(false);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Fallback dark cinematográfico — visível antes da imagem carregar
          ou se o arquivo /demo/evidencia.jpg não existir ainda. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(40,70,90,0.55) 0%, transparent 55%), " +
            "radial-gradient(ellipse at 20% 80%, rgba(15,30,40,0.55) 0%, transparent 55%), " +
            "linear-gradient(180deg, #0c1620 0%, #050b10 100%)",
        }}
      />

      {!errored ? (
        <Image
          src={EVIDENCE_IMAGE_SRC}
          alt="Cozinha profissional — evidência fotográfica enviada pela equipe operacional"
          fill
          priority
          sizes="(max-width: 640px) 100vw, 480px"
          quality={85}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : null}
      {/* O filtro de contraste para overlays é aplicado em EvidenceContent
          (DemoContent.tsx) — não duplicar aqui. */}
    </div>
  );
}
