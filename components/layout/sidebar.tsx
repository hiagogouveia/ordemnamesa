"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function Sidebar() {
    const pathname = usePathname();
    const restaurantName = useRestaurantStore((state) => state.restaurantName);
    const userRole = useRestaurantStore((state) => state.userRole);
    const [userEmail, setUserEmail] = useState("");

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
        <aside className="hidden lg:flex flex-col w-64 bg-[#111e22] border-r border-[#233f48] h-full shrink-0">
            {/* Header Sidebar */}
            <div className="flex flex-col items-start gap-4 p-6 border-b border-[#233f48]/50">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#13b6ec] text-[#111e22] shadow-[0_0_15px_rgba(19,182,236,0.2)]">
                        <span className="material-symbols-outlined text-[24px]">restaurant</span>
                    </div>
                    <div>
                        <h1 className="text-white text-lg font-bold tracking-tight leading-tight">Ordem na Mesa</h1>
                        <span className="text-xs text-[#13b6ec] font-semibold tracking-wider font-mono">ADMIN PANEL</span>
                    </div>
                </div>

                {restaurantName && (
                    <div className="w-full bg-[#16262c] rounded-lg p-3 border border-[#233f48] flex items-center justify-between group cursor-pointer hover:border-[#13b6ec]/50 transition-colors">
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs text-[#92bbc9] mb-0.5">Restaurante Atual</span>
                            <span className="text-sm text-white font-semibold truncate">{restaurantName}</span>
                        </div>
                        <span className="material-symbols-outlined text-[#325a67] text-sm group-hover:text-[#13b6ec]">unfold_more</span>
                    </div>
                )}
            </div>

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
            </div>
        </aside>
    );
}
