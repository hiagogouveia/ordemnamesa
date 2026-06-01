import type { SupabaseClient } from '@supabase/supabase-js';
import { getNowInTz, DEFAULT_TZ } from './brazil-date';

// Sprint 73 — Resolve o fuso operacional do restaurante (fonte da verdade).
// Fallback DEFAULT_TZ quando ausente (compat com base pré-migration).

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function getRestaurantTimezone(
    supabase: SupabaseClient,
    restaurantId: string,
): Promise<string> {
    const { data } = await supabase
        .from('restaurants')
        .select('timezone')
        .eq('id', restaurantId)
        .maybeSingle();
    return (data as any)?.timezone || DEFAULT_TZ;
}

/** Mapa restaurant_id -> timezone (para dashboards multi-unidade). */
export async function getRestaurantTimezones(
    supabase: SupabaseClient,
    restaurantIds: string[],
): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    if (restaurantIds.length === 0) return map;
    const { data } = await supabase
        .from('restaurants')
        .select('id, timezone')
        .in('id', restaurantIds);
    for (const r of (data as any[]) || []) {
        map[r.id] = r.timezone || DEFAULT_TZ;
    }
    // Garante fallback para ids sem linha
    for (const id of restaurantIds) if (!map[id]) map[id] = DEFAULT_TZ;
    return map;
}

/** Atalho: "agora" no fuso do restaurante. */
export async function getRestaurantNow(
    supabase: SupabaseClient,
    restaurantId: string,
    date?: Date,
) {
    const tz = await getRestaurantTimezone(supabase, restaurantId);
    return { tz, ...getNowInTz(tz, date) };
}
