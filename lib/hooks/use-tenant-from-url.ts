"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";

export interface MyRestaurant {
    id: string;
    name: string;
    slug: string;
    /** Sprint 93 — path no bucket 'brand' (NÃO url). */
    logo_path: string | null;
    account_id: string;
    account_name: string;
    /** Sprint 93 — logo do grupo; fallback desta unidade e marca da Visão Global. */
    account_logo_path: string | null;
    timezone?: string;
    role: "owner" | "manager" | "staff";
}

/** Espelha `setContextCookies` da tela de seleção — o middleware lê `x-restaurant-id`. */
function setContextCookies(r: MyRestaurant) {
    const base = "; path=/; SameSite=Lax";
    document.cookie = `x-account-id=${r.account_id}${base}`;
    document.cookie = `x-account-name=${encodeURIComponent(r.account_name)}${base}`;
    document.cookie = `x-restaurant-id=${r.id}${base}`;
    document.cookie = `x-restaurant-name=${encodeURIComponent(r.name)}${base}`;
    document.cookie = `x-restaurant-slug=${r.slug}${base}`;
    document.cookie = `x-restaurant-role=${r.role}${base}`;
}

export type TenantAdoption =
    | { status: "idle" }        // sem restaurant_id na URL, ou já é o tenant ativo
    | { status: "adopting" }
    | { status: "adopted"; restaurantName: string }
    | { status: "denied" };     // o usuário não tem acesso a essa unidade

/**
 * Adota o tenant vindo da URL (`?restaurant_id=`) — com uma regra inegociável:
 *
 *              A URL É UM PEDIDO, NUNCA UMA AUTORIDADE.
 *
 * O problema que isto resolve: `restaurant_id` vivia só em sessionStorage/cookie. Um
 * link de notificação aberto em ABA NOVA (o caso normal) chegava sem tenant — a lista
 * ficava vazia e o deep-link morria em silêncio. E um gestor multi-unidade com outra
 * unidade ativa era levado para o restaurante errado.
 *
 * Como adotamos com segurança, sem endpoint novo e sem brecha multi-tenant:
 * `GET /api/my-restaurants` já devolve APENAS os restaurantes do usuário da sessão
 * (escopado por restaurant_users no servidor). Se o id da URL está nessa lista, o
 * usuário tem acesso — a validação de membership é INERENTE. Se não está, não tocamos
 * no store e mostramos "sem acesso".
 *
 * E os dados gravados no store vêm da RESPOSTA DA API, nunca da URL — um id forjado
 * não consegue injetar nome/role. Além disso, o servidor continua revalidando tudo:
 * mesmo com o store envenenado, as rotas devolvem 403.
 */
export function useTenantFromUrl(): TenantAdoption {
    const searchParams = useSearchParams();
    const urlRestaurantId = searchParams.get("restaurant_id");

    const restaurantId = useRestaurantStore((s) => s.restaurantId);
    const setRestaurant = useRestaurantStore((s) => s.setRestaurant);
    const setAccount = useAccountSessionStore((s) => s.setAccount);
    const setMode = useAccountSessionStore((s) => s.setMode);

    const [state, setState] = useState<TenantAdoption>({ status: "idle" });

    useEffect(() => {
        if (!urlRestaurantId) {
            setState({ status: "idle" });
            return;
        }
        // Já é o tenant ativo: nada a fazer (o caso comum — clique com o app aberto).
        if (urlRestaurantId === restaurantId) {
            setState({ status: "idle" });
            return;
        }

        let cancelled = false;
        setState({ status: "adopting" });

        (async () => {
            try {
                const res = await fetch("/api/my-restaurants", { cache: "no-store" });
                if (!res.ok) throw new Error("my-restaurants");

                const { restaurants } = (await res.json()) as { restaurants: MyRestaurant[] };
                const target = restaurants.find((r) => r.id === urlRestaurantId);
                if (cancelled) return;

                if (!target) {
                    // Não pertence ao usuário. NÃO tocamos no store.
                    setState({ status: "denied" });
                    return;
                }

                setRestaurant({
                    id: target.id,
                    name: target.name,
                    slug: target.slug,
                    role: target.role,
                    timezone: target.timezone ?? null,
                    // Sprint 93 — sem isto, o merge raso do Zustand manteria a logo do
                    // tenant anterior ao abrir um deep-link de notificação.
                    logoPath: target.logo_path,
                });
                setAccount({
                    id: target.account_id,
                    name: target.account_name,
                    logoPath: target.account_logo_path,
                });
                // Notificações são sempre tenant-scoped. Abrir um deep-link em modo
                // global implica voltar para a visão da unidade — é a única forma de
                // o painel (que é por restaurante) conseguir carregar as ocorrências.
                setMode("single");
                setContextCookies(target);

                setState({ status: "adopted", restaurantName: target.name });
            } catch {
                if (!cancelled) setState({ status: "denied" });
            }
        })();

        return () => { cancelled = true; };
    }, [urlRestaurantId, restaurantId, setRestaurant, setAccount, setMode]);

    return state;
}
