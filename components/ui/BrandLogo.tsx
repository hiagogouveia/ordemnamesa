"use client";

import Image from "next/image";
import { useBrandLogo } from "@/lib/hooks/use-brand-logo";

/**
 * Sprint 93 — Logo do TENANT (restaurante/filial), com fallback para a marca da
 * plataforma. Categoria A do mapeamento.
 *
 * Convive com `components/ui/Logo.tsx`, que permanece institucional e é usado pelas
 * telas Categoria B (login, landing, cobrança, control-hub). A separação fica
 * explícita no import — `Logo` vs `BrandLogo` — em vez de escondida numa flag.
 *
 * ── Por que slot de altura fixa e não caixa quadrada ────────────────────────────
 * O `Logo` original usa `width={48} height={48}`. Marca não é quadrada: uma logo 4:1
 * renderizada com altura 40 ocuparia 160px e estouraria o nome do restaurante numa
 * sidebar de 256px. Cada superfície declara ALTURA fixa + TETO de largura, e a
 * imagem se ajusta com `object-contain` — nunca distorce, nunca vaza do slot.
 */

export type BrandLogoSlot = "sidebar" | "sidebarCollapsed" | "header" | "nav";

/**
 * Medidas derivadas do layout real:
 *  - sidebar expandida  = w-64 (256px), dividida com nome + botão de colapso
 *  - sidebar colapsada  = lg:w-20 (80px), logo centralizada
 * O caso `sidebarCollapsed` é quadrado, então logos horizontais encolhem bastante —
 * é exatamente o caso de uso da futura "logo reduzida".
 */
const SLOT: Record<BrandLogoSlot, { className: string; height: number; maxWidth: number }> = {
    sidebar: { className: "h-10 max-w-[120px]", height: 40, maxWidth: 120 },
    sidebarCollapsed: { className: "h-9 max-w-[36px]", height: 36, maxWidth: 36 },
    header: { className: "h-8 max-w-[104px]", height: 32, maxWidth: 104 },
    nav: { className: "h-6 max-w-[80px]", height: 24, maxWidth: 80 },
};

interface BrandLogoProps {
    slot?: BrandLogoSlot;
    className?: string;
}

export function BrandLogo({ slot = "sidebar", className = "" }: BrandLogoProps) {
    const { logoSrc, isTenantBranded } = useBrandLogo();
    const { className: slotClass, height, maxWidth } = SLOT[slot];

    return (
        <div className={`relative flex items-center shrink-0 ${slotClass} ${className}`}>
            <Image
                src={logoSrc}
                alt={isTenantBranded ? "Logo do restaurante" : "Ordem na Mesa"}
                // `width` é só a dica de intrínseco para o next/image; o tamanho real
                // vem do CSS (h-full/w-auto + max-w do slot).
                width={maxWidth}
                height={height}
                className="h-full w-auto object-contain object-left"
                // Marca aparece no primeiro paint de toda tela autenticada — sem isso
                // o Next faz lazy-load e ela pisca.
                priority
                // Logos de tenant vêm do Storage com hash no nome (URL imutável), então
                // não há ganho em re-otimizar; e evita um hop no otimizador do Next.
                unoptimized={isTenantBranded}
            />
        </div>
    );
}
