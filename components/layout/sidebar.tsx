"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMyActivitiesBadge } from "@/lib/hooks/use-my-activities";

const managerNavigation = [
    { name: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { name: "Meu Turno", href: "/turno", icon: "assignment_ind", badge: true },
    { name: "Checklists", href: "/checklists", icon: "checklist" },
    { name: "Equipe", href: "/equipe", icon: "group" },
    { name: "Compras", href: "/compras", icon: "shopping_cart" },
    { name: "Relatórios", href: "/relatorios", icon: "bar_chart" },
    { name: "Configurações", href: "/configuracoes", icon: "settings" },
];

const staffNavigation = [
    { name: "Turno Atual", href: "/turno", icon: "dashboard", badge: true },
    { name: "Histórico", href: "/historico", icon: "history" },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const restaurantName = useRestaurantStore((state) => state.restaurantName);
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const userRole = useRestaurantStore((state) => state.userRole);
    const clearRestaurant = useRestaurantStore((state) => state.clearRestaurant);
    const [userEmail, setUserEmail] = useState("");
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [canLaunchPurchases, setCanLaunchPurchases] = useState(false);
    const userId = useRestaurantStore((state) => state.userId);
    const { data: badgeData } = useMyActivitiesBadge(restaurantId || undefined, userId || undefined);
    const pendingCount = badgeData?.pending ?? 0;

    const handleSignOut = async () => {
        setIsLoggingOut(true);
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            clearRestaurant();
            router.push('/login');
            router.refresh();
        } catch (error) {
            console.error('[Sidebar] Erro ao fazer logout', error);
            setIsLoggingOut(false);
        }
    };

    useEffect(() => {
        async function getUser() {
            const supabase = createClient();
            const { data } = await supabase.auth.getUser();
            if (data?.user) {
                setUserEmail(data.user.email || "");

                if (userRole === 'staff' && restaurantId) {
                    const { data: userRoles } = await supabase
                        .from('user_roles')
                        .select('role:roles(can_launch_purchases)')
                        .eq('restaurant_id', restaurantId)
                        .eq('user_id', data.user.id);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const can = userRoles?.some((ur: any) => ur.role?.can_launch_purchases);
                    setCanLaunchPurchases(!!can);
                }
            }
        }
        getUser();
    }, [userRole, restaurantId]);

    return (
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#111e22] border-r border-[#233f48] flex flex-col h-full shrink-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="w-full px-6 flex items-center justify-between mb-8 pt-6">
                <div className="flex items-center gap-3">
                    <Logo width={40} height={40} />
                    <div className="flex flex-col">
                        <span className="text-white font-bold text-sm leading-tight">
                            Ordem na Mesa
                        </span>
                        {restaurantName && (
                            <span className="text-[#92bbc9] text-xs">
                                {restaurantName}
                            </span>
                        )}
                    </div>
                </div>
                <button onClick={onClose} className="lg:hidden p-1 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#1a2c32] transition-colors">
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            {restaurantName && (
                <div className="w-full px-6 mb-8">
                    <div className="w-full bg-[#16262c] rounded-lg p-3 border border-[#233f48] flex items-center justify-between group cursor-pointer hover:border-[#13b6ec]/50 transition-colors">
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs text-[#92bbc9] mb-0.5">Restaurante Atual</span>
                            <span className="text-sm text-white font-semibold truncate">{restaurantName}</span>
                        </div>
                        <span className="material-symbols-outlined text-[#325a67] text-sm group-hover:text-[#13b6ec]">unfold_more</span>
                    </div>
                </div>
            )}

            {/* Navegação */}
            <nav className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-[#325a67] uppercase tracking-wider mb-2 px-3">Menu Principal</span>
                {(userRole === 'staff'
                    ? canLaunchPurchases
                        ? [...staffNavigation, { name: "Compras", href: "/compras", icon: "shopping_cart" }]
                        : staffNavigation
                    : managerNavigation
                ).map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive
                                ? "bg-[#13b6ec]/20 text-[#13b6ec]"
                                : "text-[#92bbc9] hover:bg-[#233f48]"
                                }`}
                        >
                            <span className={`material-symbols-outlined text-[20px] ${isActive ? "text-[#13b6ec]" : ""}`}>
                                {item.icon}
                            </span>
                            {item.name}
                            {'badge' in item && item.badge && pendingCount > 0 && (
                                <span className="ml-auto bg-[#13b6ec] text-[#0a1215] text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                                    {pendingCount > 99 ? "99+" : pendingCount}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer Sidebar */}
            <div className="p-4 border-t border-[#233f48] bg-[#0c1518]/50">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#16262c] border border-[#233f48] flex items-center justify-center relative overflow-hidden shrink-0">
                        {userEmail ? (
                            <span className="text-white text-sm font-bold uppercase">{userEmail.charAt(0)}</span>
                        ) : (
                            <span className="material-symbols-outlined text-[#325a67] text-[20px]">person</span>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-white truncate">
                            {userEmail ? userEmail.split('@')[0] : 'Usuário'}
                        </span>
                        <span className="text-xs text-[#92bbc9] truncate">
                            {userRole === 'owner' ? 'Proprietário' : userRole === 'manager' ? 'Gerente' : 'Colaborador'}
                        </span>
                    </div>
                </div>
                <button
                    onClick={handleSignOut}
                    disabled={isLoggingOut}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium text-red-400 hover:text-white hover:bg-red-500 hover:border-red-400 border border-transparent transition-all disabled:opacity-50"
                >
                    <span className="material-symbols-outlined text-[18px]">
                        {isLoggingOut ? 'hourglass_empty' : 'logout'}
                    </span>
                    {isLoggingOut ? 'Saindo...' : 'Sair da conta'}
                </button>
            </div>
        </aside>
    );
}
