"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import type { PlanCode } from "@/lib/billing/types"

export interface CatalogPlan {
    code: PlanCode
    name: string
    max_units: number
    max_managers: number
    max_staff_per_unit: number
    price_monthly_cents: number
    price_yearly_cents: number
}

/**
 * Catálogo de planos (todos). RLS de `plans` libera SELECT para autenticados.
 * Ordenado por preço mensal (A→D) para o comparador.
 */
export function usePlans() {
    return useQuery<CatalogPlan[]>({
        queryKey: ["plans-catalog"],
        queryFn: async () => {
            const supabase = createClient()
            const { data, error } = await supabase
                .from("plans")
                .select("code, name, max_units, max_managers, max_staff_per_unit, price_monthly_cents, price_yearly_cents")
                .eq("active", true)
                .order("price_monthly_cents", { ascending: true })
            if (error) throw new Error(error.message)
            return (data ?? []) as CatalogPlan[]
        },
        staleTime: 30 * 60 * 1000, // catálogo muda raramente
        refetchOnWindowFocus: false,
    })
}
