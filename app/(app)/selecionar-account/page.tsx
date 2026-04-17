"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fallback: redireciona automaticamente para /selecionar-restaurante.
 * A tela de seleção de account não é mais necessária no fluxo principal.
 * Mantida apenas para compatibilidade com bookmarks/links antigos.
 */
export default function SelecionarAccountPage() {
    const router = useRouter();

    useEffect(() => {
        window.location.assign("/selecionar-restaurante");
    }, []);

    return (
        <div className="min-h-screen bg-[#101d22] flex items-center justify-center">
            <div className="text-[#92bbc9] text-sm">Redirecionando...</div>
        </div>
    );
}
