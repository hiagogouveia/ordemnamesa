import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Checklist } from "@/lib/types";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

/** Códigos legíveis por máquina — o destino escolhe a mensagem certa a partir deles. */
export type ChecklistLoadErrorCode = "CHECKLIST_NOT_FOUND" | "NO_ACCESS" | "UNKNOWN";

export class ChecklistLoadError extends Error {
    constructor(public readonly code: ChecklistLoadErrorCode) {
        super(code);
        this.name = "ChecklistLoadError";
    }
}

/**
 * Carrega UMA rotina POR ID — independentemente da lista, dos filtros ativos e de a
 * lista já ter carregado.
 *
 * É esta independência que torna o deep-link determinístico. O mecanismo antigo fazia
 * `checklists.find(c => c.id === openId)` sobre a lista em memória: se a rotina não
 * estivesse lá (filtro ativo, rotina inativa, lista ainda carregando, tenant errado),
 * o deep-link falhava em silêncio — sem painel e sem aviso.
 *
 * `initialData` é semeado do cache da listagem quando a rotina já está lá: abre
 * instantâneo, sem flash. Mas a query roda de verdade quando ela NÃO está — que é
 * justamente o caso que estava quebrado.
 */
export function useChecklistById(
    restaurantId: string | undefined,
    checklistId: string | null | undefined,
) {
    const queryClient = useQueryClient();

    return useQuery<Checklist, ChecklistLoadError>({
        queryKey: ["checklist", restaurantId, checklistId],
        queryFn: async () => {
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/checklists/${checklistId}?restaurant_id=${restaurantId}`,
                { headers, cache: "no-store" },
            );

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const code = (body.code as ChecklistLoadErrorCode) ?? "UNKNOWN";
                throw new ChecklistLoadError(code);
            }

            return res.json();
        },
        enabled: !!restaurantId && !!checklistId,

        initialData: () => {
            const list = queryClient.getQueryData<Checklist[]>(["checklists", restaurantId]);
            return list?.find((c) => c.id === checklistId);
        },
        // Sem isto, o initialData vindo do cache da lista seria tratado como fresco
        // para sempre e a query nunca revalidaria.
        initialDataUpdatedAt: () =>
            queryClient.getQueryState(["checklists", restaurantId])?.dataUpdatedAt,

        staleTime: 30_000,
        // Rotina excluída ou sem acesso não melhora com retry — e cada retry atrasa a
        // mensagem de erro que o gestor precisa ver.
        retry: (_count, error) => error.code === "UNKNOWN",
    });
}
