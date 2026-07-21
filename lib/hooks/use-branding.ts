"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { uploadBrandLogo } from "@/lib/branding/upload";
import type { NormalizedLogo } from "@/lib/branding/normalize";

/**
 * Sprint 93 — Mutations da marca.
 *
 * Ponto crítico de UX: o QueryProvider roda com `staleTime: 60_000` e
 * `refetchOnWindowFocus: false`. Confiar num refetch para a logo aparecer levaria
 * até 60 segundos — ou nunca. Por isso, no `onSuccess`, escrevemos DIRETO no store
 * Zustand (síncrono) e só então invalidamos as queries.
 *
 * É esse `setLogoPath` síncrono que entrega o "muda na hora, sem reload": os quatro
 * componentes de layout assinam o store com seletores granulares e re-renderizam no
 * mesmo tick.
 */

export type BrandingScope = "restaurant" | "account";

async function getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    return headers;
}

async function parseError(res: Response, fallback: string): Promise<Error> {
    try {
        const body = (await res.json()) as { error?: string };
        return new Error(body.error ?? fallback);
    } catch {
        return new Error(fallback);
    }
}

/** Logo do grupo. Consulta pontual — a listagem de unidades já traz a das filiais. */
export function useAccountLogo(accountId: string | null | undefined) {
    return useQuery({
        queryKey: ["account-logo", accountId],
        queryFn: async (): Promise<string | null> => {
            if (!accountId) return null;
            const supabase = createClient();
            const { data, error } = await supabase
                .from("accounts")
                .select("logo_path")
                .eq("id", accountId)
                .maybeSingle<{ logo_path: string | null }>();

            // s93c — NÃO engolir o erro. A primeira versão fazia `const { data } = ...`
            // e devolvia null em qualquer falha; quando a RLS de `accounts` quebrou por
            // recursão infinita, o card simplesmente aparecia vazio, como se não houvesse
            // logo cadastrada. Um erro de leitura tem que ser visível, não virar "sem logo".
            if (error) throw new Error(error.message);

            return data?.logo_path ?? null;
        },
        enabled: !!accountId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

interface UploadLogoInput {
    scope: BrandingScope;
    /** `restaurants.id` ou `accounts.id`, conforme o escopo. */
    targetId: string;
    /** Sempre o account_id — é o 1º segmento do path, que a RLS valida. */
    accountId: string;
    normalized: NormalizedLogo;
}

export function useUploadBrandLogo() {
    const queryClient = useQueryClient();
    const activeRestaurantId = useRestaurantStore((s) => s.restaurantId);
    const setLogoPath = useRestaurantStore((s) => s.setLogoPath);
    const setAccountLogoPath = useAccountSessionStore((s) => s.setAccountLogoPath);

    return useMutation({
        mutationFn: async ({ scope, targetId, accountId, normalized }: UploadLogoInput) => {
            // 1) Bytes vão direto ao Storage (RLS do bucket autoriza).
            const storagePath = await uploadBrandLogo(
                normalized,
                accountId,
                scope === "restaurant" ? targetId : null
            );

            // 2) Só a referência passa pelo servidor, que revalida a posse do path.
            const res = await fetch("/api/branding", {
                method: "PATCH",
                headers: await getAuthHeaders(),
                body: JSON.stringify({ scope, target_id: targetId, storage_path: storagePath }),
            });
            if (!res.ok) throw await parseError(res, "Erro ao salvar a logo.");

            return { scope, targetId, storagePath };
        },
        onSuccess: ({ scope, targetId, storagePath }) => {
            // Atualização imediata da interface — ver cabeçalho do arquivo.
            if (scope === "account") {
                setAccountLogoPath(storagePath);
            } else if (targetId === activeRestaurantId) {
                setLogoPath(storagePath);
            }
            queryClient.invalidateQueries({ queryKey: ["units"] });
            queryClient.invalidateQueries({ queryKey: ["account-logo"] });
        },
    });
}

interface RemoveLogoInput {
    scope: BrandingScope;
    targetId: string;
}

export function useRemoveBrandLogo() {
    const queryClient = useQueryClient();
    const activeRestaurantId = useRestaurantStore((s) => s.restaurantId);
    const setLogoPath = useRestaurantStore((s) => s.setLogoPath);
    const setAccountLogoPath = useAccountSessionStore((s) => s.setAccountLogoPath);

    return useMutation({
        mutationFn: async ({ scope, targetId }: RemoveLogoInput) => {
            const params = new URLSearchParams({ scope, target_id: targetId });
            const res = await fetch(`/api/branding?${params.toString()}`, {
                method: "DELETE",
                headers: await getAuthHeaders(),
            });
            if (!res.ok) throw await parseError(res, "Erro ao remover a logo.");
            return { scope, targetId };
        },
        onSuccess: ({ scope, targetId }) => {
            // Zerar no store faz a cascata cair para o próximo degrau na hora
            // (filial → grupo → Ordem na Mesa).
            if (scope === "account") {
                setAccountLogoPath(null);
            } else if (targetId === activeRestaurantId) {
                setLogoPath(null);
            }
            queryClient.invalidateQueries({ queryKey: ["units"] });
            queryClient.invalidateQueries({ queryKey: ["account-logo"] });
        },
    });
}
