"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { Logo } from "@/components/ui/Logo";
import Image from "next/image";

interface MyRestaurant {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    account_id: string;
    account_name: string;
    role: "owner" | "manager" | "staff";
}


/** Lê um cookie pelo nome (síncrono) */
function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
}

/** Seta todos os cookies de contexto atomicamente */
function setContextCookies(restaurant: MyRestaurant) {
    const base = "; path=/; SameSite=Lax";
    document.cookie = `x-account-id=${restaurant.account_id}${base}`;
    document.cookie = `x-account-name=${encodeURIComponent(restaurant.account_name)}${base}`;
    document.cookie = `x-restaurant-id=${restaurant.id}${base}`;
    document.cookie = `x-restaurant-name=${encodeURIComponent(restaurant.name)}${base}`;
    document.cookie = `x-restaurant-slug=${restaurant.slug}${base}`;
    document.cookie = `x-restaurant-role=${restaurant.role}${base}`;
    // Limpar modo global residual
    document.cookie = `x-restaurant-mode=; path=/; SameSite=Lax; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
}

/** Limpa todos os cookies de contexto */
function clearContextCookies() {
    const expire = "; path=/; SameSite=Lax; expires=Thu, 01 Jan 1970 00:00:01 GMT";
    document.cookie = `x-account-id=${expire}`;
    document.cookie = `x-account-name=${expire}`;
    document.cookie = `x-restaurant-id=${expire}`;
    document.cookie = `x-restaurant-name=${expire}`;
    document.cookie = `x-restaurant-slug=${expire}`;
    document.cookie = `x-restaurant-role=${expire}`;
    document.cookie = `x-restaurant-mode=${expire}`;
}

export default function SelecionarRestaurantePage() {
    const [restaurants, setRestaurants] = useState<MyRestaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const setRestaurant = useRestaurantStore((state) => state.setRestaurant);
    const setAccount = useAccountSessionStore((state) => state.setAccount);

    const enterRestaurant = useCallback(
        (restaurant: MyRestaurant) => {
            setRestaurant({
                id: restaurant.id,
                name: restaurant.name,
                slug: restaurant.slug,
                role: restaurant.role,
            });
            setAccount({ id: restaurant.account_id, name: restaurant.account_name });
            setContextCookies(restaurant);
            const target = restaurant.role === "staff" ? "/turno" : "/dashboard";
            window.location.assign(target);
        },
        [setRestaurant, setAccount]
    );

    useEffect(() => {
        let cancelled = false;

        async function resolve() {
            try {
                const response = await fetch("/api/my-restaurants", { credentials: "include" });

                if (response.status === 401) {
                    router.push("/login");
                    return;
                }

                if (!response.ok) {
                    throw new Error("Falha ao carregar restaurantes.");
                }

                const data = (await response.json()) as { restaurants: MyRestaurant[] };
                if (cancelled) return;

                const list = data.restaurants ?? [];

                // Step 1: Se já existe cookie válido, validar e entrar direto
                const existingRestaurantId = getCookie("x-restaurant-id");
                if (existingRestaurantId) {
                    const match = list.find((r) => r.id === existingRestaurantId);
                    if (match) {
                        enterRestaurant(match);
                        return;
                    }
                    // Cookie inválido — limpar e continuar
                    clearContextCookies();
                }

                // Step 2: Auto-skip se só tem 1 restaurante
                if (list.length === 1) {
                    enterRestaurant(list[0]);
                    return;
                }

                // Step 3: Múltiplos — mostrar UI
                setRestaurants(list);
                setLoading(false);
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : "Erro ao carregar restaurantes.");
                setLoading(false);
            }
        }

        resolve();
        return () => {
            cancelled = true;
        };
    }, [router, enterRestaurant]);

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case "owner": return "bg-[#13b6ec]/20 text-[#13b6ec] border-[#13b6ec]/30";
            case "manager": return "bg-amber-500/20 text-amber-500 border-amber-500/30";
            case "staff": return "bg-emerald-500/20 text-emerald-500 border-emerald-500/30";
            default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
        }
    };

    const translateRole = (role: string) => {
        switch (role) {
            case "owner": return "Proprietário";
            case "manager": return "Gerente";
            case "staff": return "Colaborador";
            default: return role;
        }
    };

    // Agrupar por account se há restaurantes de accounts diferentes
    const accountIds = new Set(restaurants.map((r) => r.account_id));
    const isMultiAccount = accountIds.size > 1;
    const grouped = isMultiAccount
        ? Array.from(accountIds).map((accId) => ({
            accountName: restaurants.find((r) => r.account_id === accId)!.account_name,
            items: restaurants.filter((r) => r.account_id === accId),
        }))
        : [{ accountName: null, items: restaurants }];

    return (
        <div className="min-h-screen bg-[#101d22] font-sans flex items-center justify-center p-6">
            <div className="w-full max-w-2xl flex flex-col items-center">
                <div className="flex items-center gap-3 mb-10">
                    <Logo width={48} height={48} />
                    <h1 className="text-white text-2xl font-bold tracking-tight">Ordem na Mesa</h1>
                </div>

                <div className="text-center mb-10 w-full animate-fade-in">
                    <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Selecione o Restaurante</h2>
                    <p className="text-[#92bbc9]">Escolha a unidade para iniciar sua sessão</p>
                </div>

                <div className="w-full max-w-xl flex flex-col gap-4">
                    {loading ? (
                        [1, 2].map((i) => (
                            <div key={i} className="rounded-xl border border-[#233f48] bg-[#16262c] p-5 flex items-center gap-4 animate-pulse">
                                <div className="w-14 h-14 rounded-full bg-[#233f48]"></div>
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="h-5 bg-[#233f48] rounded w-1/3"></div>
                                    <div className="h-4 bg-[#233f48] rounded w-1/4"></div>
                                </div>
                                <div className="w-20 h-6 bg-[#233f48] rounded-full"></div>
                            </div>
                        ))
                    ) : error ? (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center animate-fade-in">
                            <span className="material-symbols-outlined text-4xl text-red-400 mb-2 block">error</span>
                            <p className="text-white font-semibold mb-1">Erro ao carregar restaurantes</p>
                            <p className="text-[#92bbc9] text-sm">{error}</p>
                        </div>
                    ) : restaurants.length > 0 ? (
                        grouped.map((group, gi) => (
                            <div key={gi} className="flex flex-col gap-3">
                                {group.accountName && (
                                    <div className="flex items-center gap-2 px-1 pt-2">
                                        <span className="material-symbols-outlined text-[#325a67] text-[18px]">domain</span>
                                        <span className="text-sm font-semibold text-[#92bbc9] uppercase tracking-wider">{group.accountName}</span>
                                    </div>
                                )}
                                {group.items.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => enterRestaurant(item)}
                                        className="group flex items-center gap-4 rounded-xl border border-[#233f48] bg-[#16262c] p-5 hover:border-[#13b6ec] hover:shadow-[0_4px_20px_0_rgba(19,182,236,0.1)] transition-all text-left animate-fade-in focus:outline-none focus:ring-2 focus:ring-[#13b6ec]"
                                    >
                                        <div className="w-14 h-14 shrink-0 rounded-full border-2 border-[#233f48] group-hover:border-[#13b6ec]/50 flex items-center justify-center overflow-hidden bg-[#101d22] relative transition-colors">
                                            {item.logo_url ? (
                                                <Image src={item.logo_url} alt={`Logo ${item.name}`} fill sizes="56px" className="object-cover" />
                                            ) : (
                                                <span className="text-lg font-bold text-white">{item.name.charAt(0).toUpperCase()}</span>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white text-lg font-bold truncate group-hover:text-[#13b6ec] transition-colors">
                                                {item.name}
                                            </h3>
                                            <p className="text-[#92bbc9] text-sm truncate">
                                                /{item.slug}
                                            </p>
                                        </div>

                                        <div className={`px-3 py-1 text-xs font-bold rounded-full border ${getRoleBadgeColor(item.role)} uppercase tracking-wider`}>
                                            {translateRole(item.role)}
                                        </div>

                                        <span className="material-symbols-outlined text-[#325a67] group-hover:text-[#13b6ec] transition-colors ml-2 hidden sm:block">
                                            chevron_right
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ))
                    ) : (
                        <div className="rounded-xl border border-[#233f48] bg-[#16262c]/50 p-10 text-center animate-fade-in flex flex-col items-center">
                            <span className="material-symbols-outlined text-5xl text-[#325a67] mb-4">search_off</span>
                            <p className="text-white text-lg font-bold mb-2">Nenhum restaurante encontrado</p>
                            <p className="text-[#92bbc9]">Você não está vinculado a nenhum restaurante no momento. Entre em contato com seu gestor.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
