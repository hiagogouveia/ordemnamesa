"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { DEMO_STEPS, DEMO_WHATSAPP_URL } from "../_mock/demo-data";
import { DemoContent } from "./DemoContent";
import { DemoOverlay } from "./DemoOverlay";
import { DemoStep } from "./DemoStep";

/**
 * Controller principal do walkthrough.
 *
 * Responsabilidades:
 *  - Manter o passo atual em memória (sem persistência)
 *  - Suportar deep-link via `?step=N` (sem dependência de SessionProvider)
 *  - Atalho ESC para sair (desktop)
 *  - Roteamento: "Sair" / "Pular" → volta para `/`
 *  - Último passo → ação primária abre WhatsApp em nova aba
 *
 * Estratégia de hydration:
 *  - Estado inicial fixo (1) → server e client renderizam o mesmo HTML.
 *  - Leitura de `?step=N` em useEffect (apenas client) → evita mismatch.
 *  - Usamos window.location em vez de useSearchParams para não forçar
 *    Suspense boundary na rota.
 */
export function DemoWalkthrough() {
  const router = useRouter();
  const total = DEMO_STEPS.length;

  const [current, setCurrent] = useState<number>(1);
  const [hydrated, setHydrated] = useState(false);

  const step = useMemo(
    () => DEMO_STEPS.find((s) => s.id === current) ?? DEMO_STEPS[0],
    [current],
  );
  const isLast = current === total;

  /** Após mount: aplica deep-link `?step=N` se válido */
  useEffect(() => {
    setHydrated(true);
    const initial = readStepFromUrl(total);
    if (initial !== 1) setCurrent(initial);
  }, [total]);

  /** Sincroniza ?step=N na URL sem disparar navegação Next */
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const currentParam = url.searchParams.get("step");
    if (currentParam !== String(current)) {
      url.searchParams.set("step", String(current));
      window.history.replaceState({}, "", url.toString());
    }
  }, [current, hydrated]);

  const goNext = useCallback(() => {
    if (isLast) {
      // Último passo: abre WhatsApp em nova aba e fecha a demo voltando para landing
      if (typeof window !== "undefined") {
        window.open(DEMO_WHATSAPP_URL, "_blank", "noopener,noreferrer");
      }
      router.push("/");
      return;
    }
    setCurrent((c) => Math.min(total, c + 1));
  }, [isLast, router, total]);

  const goBack = useCallback(() => {
    setCurrent((c) => Math.max(1, c - 1));
  }, []);

  const exit = useCallback(() => {
    router.push("/");
  }, [router]);

  /** ESC fecha (desktop) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit, goNext, goBack]);

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden
                 bg-gradient-to-b from-[#0a1418] via-background-dark to-[#0a1418]
                 flex flex-col"
    >
      {/* Backdrop ambient sutil — radial sem backdrop-filter pesado */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(19,182,236,0.10) 0%, transparent 60%)",
        }}
      />

      {/* Header mínimo da demo (sem reusar Navbar para manter isolado) */}
      <header className="relative z-20 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
          aria-label="Voltar para o site"
        >
          <Logo width={26} height={26} />
          <span className="text-sm font-bold tracking-tight hidden sm:inline">
            Ordem <span className="italic font-light text-text-secondary">na Mesa</span>
          </span>
        </Link>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-text-secondary">
            Modo demonstração
          </span>
        </div>
      </header>

      {/* Stage central — o conteúdo é o ponto focal */}
      <section
        className="relative z-10 flex-1 flex items-start sm:items-center justify-center
                   px-4 sm:px-6 pt-8 sm:pt-4 pb-56 sm:pb-48"
      >
        {/*
          Ênfase suave aplicada apenas aos "screenshots" de app (checklist,
          evidence). Welcome/CTA já são auto-suficientes; dashboard tem
          janela própria com sombra, glow extra ficaria poluído.
        */}
        <DemoStep
          emphasize={step.contentKey === "checklist" || step.contentKey === "evidence"}
        >
          <DemoContent step={step} />
        </DemoStep>
      </section>

      {/* Overlay (tooltip + navegação + sair) */}
      <DemoOverlay
        step={step}
        current={current}
        total={total}
        onNext={goNext}
        onBack={goBack}
        onSkip={exit}
        onExit={exit}
        isLast={isLast}
      />
    </main>
  );
}

function readStepFromUrl(total: number): number {
  if (typeof window === "undefined") return 1;
  const raw = new URLSearchParams(window.location.search).get("step");
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= total) return n;
  return 1;
}
