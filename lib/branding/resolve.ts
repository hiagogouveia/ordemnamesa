import { brandPublicUrl } from './storage';

/**
 * Sprint 93 — Resolução da marca exibida (white-label parcial).
 *
 * Função PURA, sem React e sem I/O. Isso é deliberado: a cascata precisa rodar em
 * três runtimes diferentes e um hook só serviria o primeiro.
 *
 *   1. React client  → sidebar, header, AdminNav, ColaboradorNav
 *   2. Não-React     → lib/pdf/rotinas/generate.tsx, lib/pdf/auditoria/generate.tsx
 *   3. Server        → app/api/branding/route.ts
 *
 * Se a cascata morasse num hook, os geradores de PDF a reimplementariam na mão —
 * três cópias divergindo na primeira mudança.
 *
 * Quando entrarem cor primária, favicon ou logo reduzida, eles viram campos novos
 * em `Brand` e mais uma linha de fallback AQUI — em um único lugar.
 */

/** Logo institucional do Ordem na Mesa (asset estático same-origin, sem CORS). */
export const PLATFORM_LOGO_SRC = '/logo-icon.png';

export interface BrandSources {
    /** `restaurants.logo_path` da unidade ativa. */
    restaurantLogoPath: string | null;
    /** `accounts.logo_path` do grupo. */
    accountLogoPath: string | null;
    /** Em 'global' não existe filial única — a logo da unidade é ignorada. */
    mode: 'single' | 'global';
}

export type BrandSource = 'restaurant' | 'account' | 'platform';

export interface Brand {
    /** Sempre preenchido — nunca null, nunca string vazia. */
    logoSrc: string;
    /** De onde a logo veio. Útil para testes e para decidir textos de UI. */
    source: BrandSource;
    /** false quando caiu na marca da plataforma. */
    isTenantBranded: boolean;
}

/**
 * Cascata: filial → grupo → Ordem na Mesa.
 *
 * Na Visão Global a unidade é ignorada de propósito: o usuário está olhando dados
 * agregados de N filiais, então exibir a marca de uma delas seria mentira visual.
 */
export function resolveBrand(sources: BrandSources): Brand {
    const { restaurantLogoPath, accountLogoPath, mode } = sources;

    if (mode !== 'global') {
        const restaurantUrl = brandPublicUrl(restaurantLogoPath);
        if (restaurantUrl) {
            return { logoSrc: restaurantUrl, source: 'restaurant', isTenantBranded: true };
        }
    }

    const accountUrl = brandPublicUrl(accountLogoPath);
    if (accountUrl) {
        return { logoSrc: accountUrl, source: 'account', isTenantBranded: true };
    }

    return { logoSrc: PLATFORM_LOGO_SRC, source: 'platform', isTenantBranded: false };
}
