"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TITLES: Record<string, string> = {
    "/dashboard": "Dashboard Geral",
    "/checklists": "Gestão de Checklists",
    "/equipe": "Gestão da Equipe",
    "/relatorios": "Relatórios e Análises",
    "/configuracoes": "Configurações do Sistema",
    "/turno": "Home do Turno",
    "/historico": "Histórico de Tarefas",
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const [userInitial, setUserInitial] = useState("U");

    useEffect(() => {
        async function getUser() {
            const supabase = createClient();
            const { data } = await supabase.auth.getUser();
            if (data?.user?.email) {
                setUserInitial(data.user.email.charAt(0).toUpperCase());
            }
        }
        getUser();
    }, []);

    // Buscar o título baseando-se no path. Se for uma rota aninhada, pega a principal
    const getHeaderTitle = () => {
        const baseRoute = "/" + pathname.split("/")[1];
        return TITLES[baseRoute] || "Ordem na Mesa";
    };

    return (
        <header className="sticky top-0 z-10 w-full h-[72px] bg-[#111e22]/80 backdrop-blur-md border-b border-[#233f48] px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
                {/* Hamburger pro mobile */}
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 -ml-2 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#1a2c32] transition-colors"
                >
                    <span className="material-symbols-outlined">menu</span>
                </button>

                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#13b6ec] text-[#111e22] shadow-sm shadow-[#13b6ec]/20 lg:hidden">
                        <span className="material-symbols-outlined text-[20px]">restaurant</span>
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight hidden sm:block">{getHeaderTitle()}</h2>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button className="relative p-2 text-[#92bbc9] hover:text-white rounded-full hover:bg-[#1a2c32] transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-[#111e22]"></span>
                </button>
                <div className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full bg-[#16262c] border border-[#233f48] text-white text-sm font-bold shadow-sm">
                    {userInitial}
                </div>

                {pathname.startsWith("/checklists") && (
                    <button
                        onClick={() => router.push('/checklists?new=true')}
                        className="flex h-9 items-center gap-2 px-3 sm:px-4 bg-[#13b6ec] hover:bg-[#10a0d0] text-[#111e22] rounded-lg font-bold text-sm transition-colors shadow-[0_4px_14px_0_rgba(19,182,236,0.39)]"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        <span className="hidden sm:inline">Nova Lista</span>
                    </button>
                )}
            </div>
        </header>
    );
}
