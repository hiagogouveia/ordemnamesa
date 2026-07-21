"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { isValidBrTimezone } from "@/lib/constants/timezones";

/**
 * Sprint 73 — Self-heal do fuso operacional no client.
 * Sprint 93 — Estendido para a logo (unidade + grupo).
 *
 * O store guarda `timezone` e `logoPath` em sessionStorage, gravados só no
 * `setRestaurant` (seleção do restaurante). Se qualquer um mudar no banco depois,
 * sessões abertas continuam com o valor antigo — Meu Turno/Board (que derivam atraso
 * de `useRestaurantNow`) ficam no fuso errado, e a marca fica desatualizada, até relogar.
 *
 * Este hook, montado no AppLayout, busca os valores atuais ao montar (e quando o
 * restaurante muda) e atualiza o store se divergirem — sem precisar relogar.
 *
 * A logo pegou CARONA na query que já existia: nenhuma requisição nova foi
 * adicionada ao app. Custo continua sendo uma query indexada por carga.
 */
export function useRestaurantTimezoneSync() {
    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const timezone = useRestaurantStore((s) => s.timezone);
    const logoPath = useRestaurantStore((s) => s.logoPath);
    const setTimezone = useRestaurantStore((s) => s.setTimezone);
    const setLogoPath = useRestaurantStore((s) => s.setLogoPath);

    const accountId = useAccountSessionStore((s) => s.accountId);
    const accountLogoPath = useAccountSessionStore((s) => s.accountLogoPath);
    const setAccountLogoPath = useAccountSessionStore((s) => s.setAccountLogoPath);

    useEffect(() => {
        if (!restaurantId) return;
        let cancelled = false;

        (async () => {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("restaurants")
                .select("timezone, logo_path, accounts ( logo_path )")
                .eq("id", restaurantId)
                .maybeSingle<{
                    timezone: string | null;
                    logo_path: string | null;
                    accounts: { logo_path: string | null } | null;
                }>();

            if (cancelled || error || !data) return;

            const fresh = data.timezone;
            if (isValidBrTimezone(fresh) && fresh !== timezone) {
                setTimezone(fresh);
            }

            const freshLogo = data.logo_path ?? null;
            if (freshLogo !== logoPath) setLogoPath(freshLogo);

            const freshAccountLogo = data.accounts?.logo_path ?? null;
            if (freshAccountLogo !== accountLogoPath) setAccountLogoPath(freshAccountLogo);
        })();

        return () => {
            cancelled = true;
        };
        // Sincroniza no mount e quando o restaurante muda. `timezone`/`logoPath` são
        // lidos dentro do efeito (comparação), mas não disparam re-sync por si sós.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, setTimezone, setLogoPath, setAccountLogoPath]);

    // Sprint 93 — Visão Global não tem restaurante ativo, então o efeito acima aborta
    // no guard `if (!restaurantId)`. Mas a logo do GRUPO é justamente a marca exibida
    // nesse modo: sem este segundo caminho, ela nunca se atualizaria em sessão aberta.
    useEffect(() => {
        if (restaurantId || !accountId) return;
        let cancelled = false;

        (async () => {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("accounts")
                .select("logo_path")
                .eq("id", accountId)
                .maybeSingle<{ logo_path: string | null }>();

            if (cancelled || error || !data) return;

            const fresh = data.logo_path ?? null;
            if (fresh !== accountLogoPath) setAccountLogoPath(fresh);
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, accountId, setAccountLogoPath]);
}
