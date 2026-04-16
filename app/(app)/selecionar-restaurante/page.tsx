"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { Logo } from "@/components/ui/Logo";
import Image from "next/image";

interface RestaurantData {
    restaurant_id: string;
    role: 'owner' | 'manager' | 'staff';
    restaurants: {
        id: string;
        name: string;
        logo_url: string | null;
        slug: string;
        account_id: string;
    };
}

export default function SelecionarRestaurantePage() {
    const [restaurants, setRestaurants] = useState<RestaurantData[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const router = useRouter();
    const setRestaurant = useRestaurantStore((state) => state.setRestaurant);
    const accountId = useAccountSessionStore((state) => state.accountId);

    useEffect(() => {
        async function fetchRestaurants() {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push("/login");
                return;
            }

            if (!accountId) {
                router.push("/selecionar-account");
                return;
            }

            setCurrentUserId(user.id);

            // Buscar restaurantes onde o usuário está ativo, filtrados pela account selecionada
            const { data } = await supabase
                .from('restaurant_users')
                .select(`
          restaurant_id,
          role,
          restaurants!inner (
            id,
            name,
            logo_url,
            slug,
            account_id
          )
        `)
                .eq('active', true)
                .eq('restaurants.account_id', accountId);

            if (data) {
                const formattedData = data.map((item) => ({
                    restaurant_id: item.restaurant_id,
                    role: item.role as 'owner' | 'manager' | 'staff',
                    restaurants: Array.isArray(item.restaurants)
                        ? (item.restaurants as unknown as { id: string; name: string; logo_url: string | null; slug: string; account_id: string }[])[0]
                        : item.restaurants as { id: string; name: string; logo_url: string | null; slug: string; account_id: string }
                }));
                setRestaurants(formattedData as RestaurantData[]);
            }
            setLoading(false);
        }

        fetchRestaurants();
    }, [router, accountId]);

    const handleSelect = (restaurant: RestaurantData) => {
        setRestaurant({
            id: restaurant.restaurants.id,
            name: restaurant.restaurants.name,
            slug: restaurant.restaurants.slug,
            role: restaurant.role,
            userId: currentUserId || undefined,
        });

        // Setar cookies de contexto para uso em Server Components e middleware
        document.cookie = `x-restaurant-role=${restaurant.role}; path=/; SameSite=Strict`;
        document.cookie = `x-restaurant-id=${restaurant.restaurants.id}; path=/; SameSite=Strict`;
        document.cookie = `x-restaurant-name=${encodeURIComponent(restaurant.restaurants.name)}; path=/; SameSite=Strict`;
        document.cookie = `x-restaurant-slug=${restaurant.restaurants.slug}; path=/; SameSite=Strict`;

        if (restaurant.role === 'staff') {
            router.push("/turno");
        } else {
            router.push("/dashboard");
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'owner': return 'bg-[#13b6ec]/20 text-[#13b6ec] border-[#13b6ec]/30';
            case 'manager': return 'bg-amber-500/20 text-amber-500 border-amber-500/30';
            case 'staff': return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    const translateRole = (role: string) => {
        switch (role) {
            case 'owner': return 'Proprietário';
            case 'manager': return 'Gerente';
            case 'staff': return 'Colaborador';
            default: return role;
        }
    };

    return (
        <div className="min-h-screen bg-[#101d22] font-sans flex items-center justify-center p-6">
            <div className="w-full max-w-2xl flex flex-col items-center">
                {/* Header Simples */}
                <div className="flex items-center gap-3 mb-10">
                    <Logo width={48} height={48} />
                    <h1 className="text-white text-2xl font-bold tracking-tight">Ordem na Mesa</h1>
                </div>

                <div className="text-center mb-10 w-full animate-fade-in">
                    <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Selecione o Restaurante</h2>
                    <p className="text-[#92bbc9]">Escolha a unidade para iniciar sua sessão</p>
                </div>

                {/* Content */}
                <div className="w-full max-w-xl flex flex-col gap-4">
                    {loading ? (
                        // Skeleton Loader
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
                    ) : restaurants.length > 0 ? (
                        restaurants.map((item) => (
                            <button
                                key={item.restaurant_id}
                                onClick={() => handleSelect(item)}
                                className="group flex items-center gap-4 rounded-xl border border-[#233f48] bg-[#16262c] p-5 hover:border-[#13b6ec] hover:shadow-[0_4px_20px_0_rgba(19,182,236,0.1)] transition-all text-left animate-fade-in focus:outline-none focus:ring-2 focus:ring-[#13b6ec]"
                            >
                                <div className="w-14 h-14 shrink-0 rounded-full border-2 border-[#233f48] group-hover:border-[#13b6ec]/50 flex items-center justify-center overflow-hidden bg-[#101d22] relative transition-colors">
                                    {item.restaurants.logo_url ? (
                                        <Image src={item.restaurants.logo_url} alt={`Logo ${item.restaurants.name}`} fill sizes="56px" className="object-cover" />
                                    ) : (
                                        <span className="text-lg font-bold text-white">{item.restaurants.name.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white text-lg font-bold truncate group-hover:text-[#13b6ec] transition-colors">
                                        {item.restaurants.name}
                                    </h3>
                                    <p className="text-[#92bbc9] text-sm truncate">
                                        /{item.restaurants.slug}
                                    </p>
                                </div>

                                <div className={`px-3 py-1 text-xs font-bold rounded-full border ${getRoleBadgeColor(item.role)} uppercase tracking-wider`}>
                                    {translateRole(item.role)}
                                </div>

                                <span className="material-symbols-outlined text-[#325a67] group-hover:text-[#13b6ec] transition-colors ml-2 hidden sm:block">
                                    chevron_right
                                </span>
                            </button>
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
