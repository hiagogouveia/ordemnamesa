import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistTemplate } from "@/lib/types";

// Sprint 70 — Modelos de Rotinas Prontas.
// Catálogo GLOBAL read-only. Muda raramente → staleTime alto, sem realtime.

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    return headers;
}

export function useChecklistTemplates(enabled = true) {
    return useQuery({
        queryKey: ["checklist-templates"],
        queryFn: async (): Promise<ChecklistTemplate[]> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklist-templates", { headers, cache: "no-store" });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao buscar modelos de rotina");
            }
            return res.json();
        },
        enabled,
        staleTime: 30 * 60 * 1000, // 30 min — catálogo estável
        refetchOnWindowFocus: false,
    });
}
