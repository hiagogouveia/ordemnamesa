"use client";

import { useEffect, useState } from "react";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { getNowInTz } from "@/lib/utils/brazil-date";

// Sprint 73 — "Agora" no FUSO do restaurante (fonte única no client).
// Substitui new Date() do navegador em cálculos operacionais de dia/atraso.
// Atualiza a cada minuto.
export function useRestaurantNow() {
    const tz = useRestaurantStore((s) => s.timezone);
    const [now, setNow] = useState(() => getNowInTz(tz));

    useEffect(() => {
        const tick = () => setNow(getNowInTz(tz));
        tick(); // recalcula imediatamente quando o fuso muda
        const id = setInterval(tick, 60_000);
        return () => clearInterval(id);
    }, [tz]);

    return {
        tz,
        dayOfWeek: now.dayOfWeek,
        dateKey: now.dateKey,
        timeHHMM: now.timeHHMM,
        currentMinutes: now.minutes,
    };
}
