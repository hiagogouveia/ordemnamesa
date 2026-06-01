import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { BillingError } from "@/lib/billing/client-errors";
import type { ChecklistKit, ApplyKitResult } from "@/lib/types";

// Sprint 72 — Kits de Rotinas (catálogo + aplicação + desfazer).

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

export function useChecklistKits(enabled = true) {
    return useQuery({
        queryKey: ["checklist-kits"],
        queryFn: async (): Promise<ChecklistKit[]> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklist-kits", { headers, cache: "no-store" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar kits");
            }
            return res.json();
        },
        enabled,
        staleTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

interface ApplyKitVars {
    restaurantId: string;
    kitId: string;
    levels: string[];
    extraTemplateIds?: string[];
}

export function useApplyKit() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: ApplyKitVars): Promise<ApplyKitResult> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklist-kits/apply", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    restaurant_id: vars.restaurantId,
                    kit_id: vars.kitId,
                    levels: vars.levels,
                    extra_template_ids: vars.extraTemplateIds ?? [],
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 402 && err?.reason) {
                    throw new BillingError(err.error, res.status, err.reason);
                }
                throw new Error(err.error || "Erro ao aplicar o kit");
            }
            return res.json();
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", vars.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["areas", vars.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", vars.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", vars.restaurantId] });
        },
    });
}

interface UndoKitVars {
    restaurantId: string;
    checklistIds: string[];
}

export function useUndoKitApply() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: UndoKitVars): Promise<{ deleted_count: number; protected_count: number }> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklist-kits/undo", {
                method: "POST",
                headers,
                body: JSON.stringify({ restaurant_id: vars.restaurantId, checklist_ids: vars.checklistIds }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao desfazer a aplicação");
            }
            return res.json();
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ["checklists", vars.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", vars.restaurantId] });
            queryClient.invalidateQueries({ queryKey: ["my-activities", vars.restaurantId] });
        },
    });
}
