"use client";

import { useMemo } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useAccountSessionStore } from '@/lib/store/account-session-store';
import { resolveBrand, type Brand } from '@/lib/branding/resolve';

/**
 * Sprint 93 — Adaptador React da cascata de marca.
 *
 * Deliberadamente fino: toda a regra vive em `resolveBrand()` (função pura), que
 * também é chamada pelos geradores de PDF e pelo servidor. Aqui só lemos os stores.
 *
 * Os seletores são granulares de propósito — assinar o store inteiro faria os quatro
 * componentes de layout re-renderizarem a cada mudança de qualquer campo de sessão.
 */
export function useBrandLogo(): Brand {
    const restaurantLogoPath = useRestaurantStore((s) => s.logoPath);
    const accountLogoPath = useAccountSessionStore((s) => s.accountLogoPath);
    const mode = useAccountSessionStore((s) => s.mode);

    return useMemo(
        () => resolveBrand({ restaurantLogoPath, accountLogoPath, mode }),
        [restaurantLogoPath, accountLogoPath, mode]
    );
}
