"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { resolveBrand, type Brand } from "@/lib/branding/resolve";
import type { Scope } from "@/lib/types/scope";

/**
 * Sprint 93 — Resolve a marca a partir de um ESCOPO EXPLÍCITO, não do store.
 *
 * Existe por causa de um detalhe real da página de impressão: ela abre em nova aba
 * (`window.open`), e `sessionStorage` é COPIADO no momento da abertura. Se a logo
 * mudar depois, aquela aba ficaria com o valor velho para sempre — e como é a aba
 * que vira PDF entregue a terceiros, o erro sairia impresso.
 *
 * A página já recebe `restaurant_id`/`account_id` na querystring, então resolver a
 * partir daí é mais robusto e não depende de estado compartilhado entre abas.
 */
export function useBrandByScope(scope: Scope | null): Brand | null {
    const { data } = useQuery({
        queryKey: [
            "brand-by-scope",
            scope?.mode,
            scope?.mode === "single" ? scope.restaurantId : scope?.accountId,
        ],
        queryFn: async (): Promise<Brand> => {
            const supabase = createClient();

            if (scope?.mode === "global") {
                const { data: account } = await supabase
                    .from("accounts")
                    .select("logo_path")
                    .eq("id", scope.accountId)
                    .maybeSingle<{ logo_path: string | null }>();
                return resolveBrand({
                    restaurantLogoPath: null,
                    accountLogoPath: account?.logo_path ?? null,
                    mode: "global",
                });
            }

            const { data: restaurant } = await supabase
                .from("restaurants")
                .select("logo_path, accounts ( logo_path )")
                .eq("id", scope!.restaurantId)
                .maybeSingle<{ logo_path: string | null; accounts: { logo_path: string | null } | null }>();

            return resolveBrand({
                restaurantLogoPath: restaurant?.logo_path ?? null,
                accountLogoPath: restaurant?.accounts?.logo_path ?? null,
                mode: "single",
            });
        },
        enabled: !!scope,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    return data ?? null;
}
