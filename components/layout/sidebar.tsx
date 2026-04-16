"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { useAccountAccess } from "@/lib/hooks/use-account-access";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMyActivitiesBadge } from "@/lib/hooks/use-my-activities";

interface NavItem {
    name: string;
    href: string;
    icon: string;
    badge?: boolean;
    globalSupported?: boolean;
}

const managerNavigation: NavItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { name: "Meu Turno", href: "/turno", icon: "assignment_ind", badge: true },
    { name: "Checklists", href: "/checklists", icon: "checklist", globalSupported: true },
    { name: "Equipe", href: "/equipe", icon: "group", globalSupported: true },
    { name: "Compras", href: "/compras", icon: "shopping_cart" },
    { name: "Relatórios", href: "/relatorios", icon: "bar_chart" },
    { name: "Configurações", href: "/configuracoes", icon: "settings" },
];

const staffNavigation: NavItem[] = [
    { name: "Turno Atual", href: "/turno", icon: "dashboard", badge: true },
    { name: "Histórico", href: "/historico", icon: "history" },
];

const GLOBAL_SUPPORTED_ROUTES = ["/equipe", "/checklists"];

type SidebarProps = {
    isOpen?: boolean;
    onClose?: () => void;
    collapsed?: boolean;
    onToggle?: () => void;
};

export function Sidebar({ isOpen, onClose, collapsed = false, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const restaurantName = useRestaurantStore((state) => state.restaurantName);
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const userRole = useRestaurantStore((state) => state.userRole);
    const setRestaurant = useRestaurantStore((state) => state.setRestaurant);
    const clearRestaurant = useRestaurantStore((state) => state.clearRestaurant);
    const accountId = useAccountSessionStore((state) => state.accountId);
    const accountName = useAccountSessionStore((state) => state.accountName);
    const accountMode = useAccountSessionStore((state) => state.mode);
    const setAccountMode = useAccountSessionStore((state) => state.setMode);
    const clearAccount = useAccountSessionStore((state) => state.clearAccount);
    const isGlobal = accountMode === "global";
    const { data: accountAccess } = useAccountAccess(accountId);
    const units = accountAccess?.units ?? [];
    const canGlobal = !!accountAccess?.canUseGlobal;
    const accountRole = accountAccess?.role ?? null;
    const [userEmail, setUserEmail] = useState("");
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [canLaunchPurchases, setCanLaunchPurchases] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const switcherRef = useRef<HTMLDivElement>(null);
    const userId = useRestaurantStore((state) => state.userId);
    const { data: badgeData } = useMyActivitiesBadge(restaurantId || undefined, userId || undefined);
    const pendingCount = badgeData?.pending ?? 0;

    useEffect(() => {
        if (!switcherOpen) return;
        const handler = (e: MouseEvent) => {
            if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
                setSwitcherOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [switcherOpen]);

    const enterGlobal = () => {
        if (!canGlobal) return;
        clearRestaurant();
        setAccountMode("global");
        const base = "; path=/; SameSite=Strict";
        document.cookie = `x-restaurant-id=${base}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `x-restaurant-role=${accountRole ?? "manager"}${base}`;
        document.cookie = `x-restaurant-mode=global${base}`;
        setSwitcherOpen(false);
        if (!GLOBAL_SUPPORTED_ROUTES.some((r) => pathname.startsWith(r))) {
            router.push("/checklists");
        }
    };

    const switchToUnit = async (unitId: string, unitName: string) => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: link } = await supabase
            .from('restaurant_users')
            .select('role, restaurants ( id, name, slug )')
            .eq('restaurant_id', unitId)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle<{ role: 'owner' | 'manager' | 'staff'; restaurants: { id: string; name: string; slug: string } | null }>();

        const nextRole = link?.role ?? (accountRole === 'owner' ? 'owner' : 'manager');
        const slug = link?.restaurants?.slug ?? '';

        setRestaurant({ id: unitId, name: unitName, slug, role: nextRole, userId: user.id });
        setAccountMode("single");

        const base = "; path=/; SameSite=Strict";
        document.cookie = `x-restaurant-id=${unitId}${base}`;
        document.cookie = `x-restaurant-name=${encodeURIComponent(unitName)}${base}`;
        document.cookie = `x-restaurant-slug=${slug}${base}`;
        document.cookie = `x-restaurant-role=${nextRole}${base}`;
        document.cookie = `x-restaurant-mode=${base}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;

        setSwitcherOpen(false);
        router.refresh();
    };

    const handleSignOut = async () => {
        setIsLoggingOut(true);
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            clearRestaurant();
            clearAccount();
            const base = "; path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:01 GMT";
            document.cookie = `x-restaurant-id=${base}`;
            document.cookie = `x-restaurant-name=${base}`;
            document.cookie = `x-restaurant-slug=${base}`;
            document.cookie = `x-restaurant-role=${base}`;
            document.cookie = `x-restaurant-mode=${base}`;
            document.cookie = `x-account-id=${base}`;
            document.cookie = `x-account-name=${base}`;
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
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#111e22] border-r border-[#233f48] flex flex-col h-full shrink-0 transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}>
            {/* Header expandido: visível no mobile (sempre) e desktop expandido */}
            <div className={`w-full mb-8 pt-6 px-4 flex items-center justify-between ${collapsed ? 'lg:hidden' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <Logo width={40} height={40} className="shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <span className="text-white font-bold text-sm leading-tight">
                            Ordem na Mesa
                        </span>
                        {restaurantName && (
                            <span className="text-[#92bbc9] text-xs truncate">
                                {restaurantName}
                            </span>
                        )}
                    </div>
                </div>
                {/* Fechar drawer — somente mobile */}
                <button onClick={onClose} className="lg:hidden p-1 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#1a2c32] transition-colors shrink-0">
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
                {/* Toggle colapso — somente desktop */}
                <button
                    onClick={onToggle}
                    className="hidden lg:flex p-1 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#1a2c32] transition-colors shrink-0"
                >
                    <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
            </div>

            {/* Header colapsado: visível somente no desktop quando colapsado */}
            <div className={`w-full mb-4 pt-6 hidden flex-col items-center gap-2 ${collapsed ? 'lg:flex' : ''}`}>
                <Logo width={36} height={36} className="shrink-0" />
                <button
                    onClick={onToggle}
                    className="p-1 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#1a2c32] transition-colors"
                >
                    <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
            </div>

            {(userRole !== 'staff') && (accountName || restaurantName) && (
                <div ref={switcherRef} className={`relative w-full px-4 mb-8 ${collapsed ? 'lg:hidden' : ''}`}>
                    <button
                        type="button"
                        onClick={() => setSwitcherOpen((v) => !v)}
                        className="w-full bg-[#16262c] rounded-lg p-3 border border-[#233f48] flex items-center justify-between group hover:border-[#13b6ec]/50 transition-colors text-left"
                    >
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs text-[#92bbc9] mb-0.5">
                                {isGlobal ? 'Contexto' : 'Restaurante Atual'}
                            </span>
                            <span className="text-sm text-white font-semibold truncate flex items-center gap-1.5">
                                {isGlobal && (
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px]">public</span>
                                )}
                                {isGlobal ? `Visão Global${accountName ? ` · ${accountName}` : ''}` : restaurantName}
                            </span>
                        </div>
                        <span className="material-symbols-outlined text-[#325a67] text-sm group-hover:text-[#13b6ec]">unfold_more</span>
                    </button>
                    {switcherOpen && (
                        <div className="absolute left-4 right-4 mt-2 z-20 bg-[#16262c] border border-[#233f48] rounded-lg shadow-xl overflow-hidden">
                            <div className="max-h-72 overflow-y-auto py-1">
                                {canGlobal && (
                                    <button
                                        type="button"
                                        onClick={enterGlobal}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#1a2c32] transition-colors ${isGlobal ? 'bg-[#13b6ec]/10 text-[#13b6ec]' : 'text-white'}`}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">public</span>
                                        <span className="flex-1 truncate">Visão Global</span>
                                        {isGlobal && (
                                            <span className="material-symbols-outlined text-[18px] text-[#13b6ec]">check</span>
                                        )}
                                    </button>
                                )}
                                {canGlobal && units.length > 0 && (
                                    <div className="my-1 border-t border-[#233f48]" />
                                )}
                                {units.length === 0 && !canGlobal && (
                                    <div className="px-3 py-2 text-xs text-[#92bbc9]">Nenhuma unidade disponível</div>
                                )}
                                {units.map((u) => {
                                    const isCurrent = !isGlobal && u.id === restaurantId;
                                    return (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => switchToUnit(u.id, u.name)}
                                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#1a2c32] transition-colors ${isCurrent ? 'bg-[#13b6ec]/10 text-[#13b6ec]' : 'text-white'}`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">storefront</span>
                                            <span className="flex-1 truncate">{u.name}</span>
                                            {isCurrent && (
                                                <span className="material-symbols-outlined text-[18px] text-[#13b6ec]">check</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {userRole === 'staff' && restaurantName && (
                <div className={`w-full px-4 mb-8 ${collapsed ? 'lg:hidden' : ''}`}>
                    <div className="w-full bg-[#16262c] rounded-lg p-3 border border-[#233f48] flex items-center justify-between">
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs text-[#92bbc9] mb-0.5">Restaurante Atual</span>
                            <span className="text-sm text-white font-semibold truncate">{restaurantName}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Navegação */}
            <nav className="flex-1 overflow-y-auto px-3 py-6 flex flex-col gap-1.5">
                <span className={`text-[11px] font-bold text-[#325a67] uppercase tracking-wider mb-2 px-3 ${collapsed ? 'lg:hidden' : ''}`}>Menu Principal</span>
                {(userRole === 'staff'
                    ? canLaunchPurchases
                        ? [...staffNavigation, { name: "Compras", href: "/compras", icon: "shopping_cart" }]
                        : staffNavigation
                    : isGlobal
                        ? managerNavigation.filter((n) => n.globalSupported)
                        : managerNavigation
                ).map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            title={collapsed ? item.name : undefined}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive
                                ? "bg-[#13b6ec]/20 text-[#13b6ec]"
                                : "text-[#92bbc9] hover:bg-[#233f48]"
                            } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                        >
                            <span className={`material-symbols-outlined text-[20px] shrink-0 ${isActive ? "text-[#13b6ec]" : ""}`}>
                                {item.icon}
                            </span>
                            <span className={collapsed ? 'lg:hidden' : ''}>{item.name}</span>
                            {'badge' in item && item.badge && pendingCount > 0 && (
                                <span className={`ml-auto bg-[#13b6ec] text-[#0a1215] text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight ${collapsed ? 'lg:hidden' : ''}`}>
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
                    <div className={`flex flex-col min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
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
                    title={collapsed ? (isLoggingOut ? 'Saindo...' : 'Sair da conta') : undefined}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium text-red-400 hover:text-white hover:bg-red-500 hover:border-red-400 border border-transparent transition-all disabled:opacity-50"
                >
                    <span className="material-symbols-outlined text-[18px]">
                        {isLoggingOut ? 'hourglass_empty' : 'logout'}
                    </span>
                    <span className={collapsed ? 'lg:hidden' : ''}>{isLoggingOut ? 'Saindo...' : 'Sair da conta'}</span>
                </button>
            </div>
        </aside>
    );
}
