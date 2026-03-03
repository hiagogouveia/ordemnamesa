"use client";

import { usePathname, useRouter } from "next/navigation";

const TITLES: Record<string, string> = {
    "/dashboard": "Dashboard Geral",
    "/checklists": "Gestão de Checklists",
    "/equipe": "Gestão da Equipe",
    "/relatorios": "Relatórios e Análises",
    "/configuracoes": "Configurações do Sistema",
};

export function Header() {
    const pathname = usePathname();
    const router = useRouter();

    // Buscar o título baseando-se no path. Se for uma rota aninhada, pega a principal
    const getHeaderTitle = () => {
        const baseRoute = "/" + pathname.split("/")[1];
        return TITLES[baseRoute] || "Ordem na Mesa";
    };

    return (
        <header className="sticky top-0 z-10 w-full h-[72px] bg-[#111e22]/80 backdrop-blur-md border-b border-[#233f48] px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
                {/* Hamburger pro mobile */}
                <button className="lg:hidden p-2 -ml-2 text-[#92bbc9] hover:text-white rounded-lg hover:bg-[#1a2c32] transition-colors">
                    <span className="material-symbols-outlined">menu</span>
                </button>

                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">{getHeaderTitle()}</h2>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button className="relative p-2 text-[#92bbc9] hover:text-white rounded-full hover:bg-[#1a2c32] transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-[#111e22]"></span>
                </button>

                {pathname.startsWith("/checklists") && (
                    <button
                        onClick={() => router.push('/checklists?new=true')}
                        className="hidden sm:flex h-9 items-center gap-2 px-4 bg-[#13b6ec] hover:bg-[#10a0d0] text-[#111e22] rounded-lg font-bold text-sm transition-colors shadow-[0_4px_14px_0_rgba(19,182,236,0.39)]"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Nova Lista
                    </button>
                )}
            </div>
        </header>
    );
}
