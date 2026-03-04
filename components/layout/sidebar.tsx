"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { name: "Checklists", href: "/checklists", icon: "checklist" },
    { name: "Equipe", href: "/equipe", icon: "group" },
    { name: "Relatórios", href: "/relatorios", icon: "bar_chart" },
    { name: "Configurações", href: "/configuracoes", icon: "settings" },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const restaurantName = useRestaurantStore((state) => state.restaurantName);
    const userRole = useRestaurantStore((state) => state.userRole);
    const clearRestaurant = useRestaurantStore((state) => state.clearRestaurant);
    const [userEmail, setUserEmail] = useState("");
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleSignOut = async () => {
        setIsLoggingOut(true);
        try {
            await fetch('/api/auth/signout', { method: 'POST' });
            clearRestaurant();
            router.push('/login');
            router.refresh();
        } catch (error) {
            console.error('Erro ao fazer logout', error);
            setIsLoggingOut(false);
        }
    };

    useEffect(() => {
        async function getUser() {
            const supabase = createClient();
            const { data } = await supabase.auth.getUser();
            if (data?.user) {
                setUserEmail(data.user.email || "");
            }
        }
        getUser();
    }, []);

    return (
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#111e22] border-r border-[#233f48] flex flex-col h-full shrink-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="w-full px-6 flex items-center justify-between mb-8 pt-6">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#13b6ec] text-[#111e22] shadow-sm shadow-[#13b6ec]/20">
                        <span className="material-symbols-outlined text-[20px]">restaurant</span>
                    </div>
                    <h1 className="text-white text-lg font-bold tracking-tight">OnMesa</h1>
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
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? "bg-[#233f48] text-white"
                                : "text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white"
                                }`}
                        >
                            <span className={`material-symbols-outlined text-[20px] ${isActive ? "text-[#13b6ec]" : ""}`}>
                                {item.icon}
                            </span>
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer Sidebar */}
            <div className="p-4 border-t border-[#233f48] bg-[#0c1518]/50">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#16262c] border border-[#233f48] flex items-center justify-center relative overflow-hidden shrink-0">
                        <span className="material-symbols-outlined text-[#325a67] text-[20px]">person</span>
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
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium text-red-400 hover:text-white hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all disabled:opacity-50"
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
