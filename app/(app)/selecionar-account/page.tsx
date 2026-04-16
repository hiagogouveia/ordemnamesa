"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { Logo } from "@/components/ui/Logo";

interface AccountItem {
    id: string;
    name: string;
}

export default function SelecionarAccountPage() {
    const [accounts, setAccounts] = useState<AccountItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const setAccount = useAccountSessionStore((state) => state.setAccount);

    const selectAccount = useCallback(
        (account: AccountItem) => {
            setAccount({ id: account.id, name: account.name });
            const base = "; path=/; SameSite=Lax";
            document.cookie = `x-account-id=${account.id}${base}`;
            document.cookie = `x-account-name=${encodeURIComponent(account.name)}${base}`;
            // Full navigation para garantir que o middleware veja os cookies recém-setados.
            // router.push pode usar RSC prefetch anterior ao cookie set, causando redirect loop.
            window.location.assign("/selecionar-restaurante");
        },
        [setAccount]
    );

    useEffect(() => {
        let cancelled = false;

        async function fetchAccounts() {
            try {
                const response = await fetch("/api/accounts", { credentials: "include" });

                if (response.status === 401) {
                    router.push("/login");
                    return;
                }

                if (!response.ok) {
                    throw new Error("Falha ao carregar contas.");
                }

                const data = (await response.json()) as { accounts: AccountItem[] };
                if (cancelled) return;

                const list = data.accounts ?? [];

                if (list.length === 1) {
                    selectAccount(list[0]);
                    return;
                }

                setAccounts(list);
                setLoading(false);
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : "Erro ao carregar contas.");
                setLoading(false);
            }
        }

        fetchAccounts();
        return () => {
            cancelled = true;
        };
    }, [router, selectAccount]);

    return (
        <div className="min-h-screen bg-[#101d22] font-sans flex items-center justify-center p-6">
            <div className="w-full max-w-2xl flex flex-col items-center">
                <div className="flex items-center gap-3 mb-10">
                    <Logo width={48} height={48} />
                    <h1 className="text-white text-2xl font-bold tracking-tight">Ordem na Mesa</h1>
                </div>

                <div className="text-center mb-10 w-full animate-fade-in">
                    <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Selecione a Conta</h2>
                    <p className="text-[#92bbc9]">Escolha a organização para iniciar sua sessão</p>
                </div>

                <div className="w-full max-w-xl flex flex-col gap-4">
                    {loading ? (
                        [1, 2].map((i) => (
                            <div
                                key={i}
                                className="rounded-xl border border-[#233f48] bg-[#16262c] p-5 flex items-center gap-4 animate-pulse"
                            >
                                <div className="w-14 h-14 rounded-full bg-[#233f48]"></div>
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="h-5 bg-[#233f48] rounded w-1/3"></div>
                                    <div className="h-4 bg-[#233f48] rounded w-1/4"></div>
                                </div>
                            </div>
                        ))
                    ) : error ? (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center animate-fade-in">
                            <span className="material-symbols-outlined text-4xl text-red-400 mb-2 block">error</span>
                            <p className="text-white font-semibold mb-1">Erro ao carregar contas</p>
                            <p className="text-[#92bbc9] text-sm">{error}</p>
                        </div>
                    ) : accounts.length > 0 ? (
                        accounts.map((account) => (
                            <button
                                key={account.id}
                                onClick={() => selectAccount(account)}
                                className="group flex items-center gap-4 rounded-xl border border-[#233f48] bg-[#16262c] p-5 hover:border-[#13b6ec] hover:shadow-[0_4px_20px_0_rgba(19,182,236,0.1)] transition-all text-left animate-fade-in focus:outline-none focus:ring-2 focus:ring-[#13b6ec]"
                            >
                                <div className="w-14 h-14 shrink-0 rounded-full border-2 border-[#233f48] group-hover:border-[#13b6ec]/50 flex items-center justify-center bg-[#101d22] transition-colors">
                                    <span className="material-symbols-outlined text-[#13b6ec]">domain</span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white text-lg font-bold truncate group-hover:text-[#13b6ec] transition-colors">
                                        {account.name}
                                    </h3>
                                    <p className="text-[#92bbc9] text-sm">Conta</p>
                                </div>

                                <span className="material-symbols-outlined text-[#325a67] group-hover:text-[#13b6ec] transition-colors ml-2 hidden sm:block">
                                    chevron_right
                                </span>
                            </button>
                        ))
                    ) : (
                        <div className="rounded-xl border border-[#233f48] bg-[#16262c]/50 p-10 text-center animate-fade-in flex flex-col items-center">
                            <span className="material-symbols-outlined text-5xl text-[#325a67] mb-4">search_off</span>
                            <p className="text-white text-lg font-bold mb-2">Nenhuma conta encontrada</p>
                            <p className="text-[#92bbc9]">
                                Você não está vinculado a nenhuma conta no momento. Entre em contato com seu gestor.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
