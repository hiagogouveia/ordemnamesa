"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { isValidBrTimezone } from "@/lib/constants/timezones";

/**
 * Sprint 73 — Self-heal do fuso operacional no client.
 *
 * O store guarda `timezone` em sessionStorage, gravado só no `setRestaurant`
 * (seleção do restaurante). Se o fuso for alterado no banco depois, sessões
 * abertas continuam com o valor antigo — Meu Turno/Board (que derivam atraso
 * de `useRestaurantNow`) ficam no fuso errado até relogar.
 *
 * Este hook, montado no AppLayout, busca o fuso atual do restaurante no banco
 * ao montar (e quando o restaurante muda) e atualiza o store se divergir —
 * sem precisar relogar. Custo: uma query indexada por carga.
 */
export function useRestaurantTimezoneSync() {
    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const timezone = useRestaurantStore((s) => s.timezone);
    const setTimezone = useRestaurantStore((s) => s.setTimezone);

    useEffect(() => {
        if (!restaurantId) return;
        let cancelled = false;

        (async () => {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("restaurants")
                .select("timezone")
                .eq("id", restaurantId)
                .maybeSingle<{ timezone: string | null }>();

            if (cancelled || error || !data) return;
            const fresh = data.timezone;
            if (isValidBrTimezone(fresh) && fresh !== timezone) {
                setTimezone(fresh);
            }
        })();

        return () => {
            cancelled = true;
        };
        // Sincroniza no mount e quando o restaurante muda. `timezone` é lido
        // dentro do efeito (comparação), mas não dispara re-sync por si só.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, setTimezone]);
}
