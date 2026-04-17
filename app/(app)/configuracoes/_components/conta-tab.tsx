"use client";

import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useGlobalPermissions, useToggleGlobalPermission } from "@/lib/hooks/use-global-permissions";

export function ContaTab() {
    const accountId = useAccountSessionStore((s) => s.accountId);
    const userRole = useRestaurantStore((s) => s.userRole);
    const isOwner = userRole === "owner";

    const { data, isLoading, error } = useGlobalPermissions(isOwner ? accountId : null);
    const togglePermission = useToggleGlobalPermission(accountId);

    const managers = data?.managers ?? [];

    if (!isOwner) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="flex flex-col items-center justify-center max-w-sm text-center">
                    <div className="w-16 h-16 rounded-full bg-[#1a2c32] flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-[#325a67] text-3xl">lock</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Acesso restrito</h2>
                    <p className="text-sm text-[#92bbc9]">
                        Apenas proprietários podem gerenciar configurações da conta.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
            {/* Seção: Visão Global */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-[#13b6ec] text-[22px]">public</span>
                    <h2 className="text-lg font-bold text-white">Visão Global</h2>
                </div>
                <p className="text-sm text-[#92bbc9] mb-6">
                    A Visão Global permite visualizar dados agregados de todas as unidades.
                    Proprietários sempre têm acesso. Gerencie abaixo quais gerentes podem acessar.
                </p>

                {isLoading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2].map((i) => (
                            <div key={i} className="rounded-xl border border-[#233f48] bg-[#16262c] p-4 flex items-center gap-4 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-[#233f48]"></div>
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="h-4 bg-[#233f48] rounded w-1/3"></div>
                                    <div className="h-3 bg-[#233f48] rounded w-1/4"></div>
                                </div>
                                <div className="w-12 h-6 bg-[#233f48] rounded-full"></div>
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                        <p className="text-red-400 text-sm">Erro ao carregar permissões.</p>
                    </div>
                ) : managers.length === 0 ? (
                    <div className="rounded-xl border border-[#233f48] bg-[#16262c]/50 p-8 text-center">
                        <span className="material-symbols-outlined text-3xl text-[#325a67] mb-3 block">group_off</span>
                        <p className="text-white font-semibold mb-1">Nenhum gerente encontrado</p>
                        <p className="text-sm text-[#92bbc9]">
                            Adicione gerentes na seção Equipe para gerenciar permissões de Visão Global.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {managers.map((manager) => (
                            <div
                                key={manager.id}
                                className="rounded-xl border border-[#233f48] bg-[#16262c] p-4 flex items-center gap-4"
                            >
                                <div className="w-10 h-10 shrink-0 rounded-full bg-[#101d22] border border-[#233f48] flex items-center justify-center">
                                    <span className="text-sm font-bold text-white">
                                        {(manager.name || manager.email).charAt(0).toUpperCase()}
                                    </span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold text-sm truncate">
                                        {manager.name || "Sem nome"}
                                    </p>
                                    <p className="text-[#92bbc9] text-xs truncate">{manager.email}</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        togglePermission.mutate({
                                            accountUserId: manager.id,
                                            canViewGlobal: !manager.can_view_global,
                                        })
                                    }
                                    disabled={togglePermission.isPending}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#13b6ec] focus:ring-offset-2 focus:ring-offset-[#101d22] disabled:opacity-50 ${
                                        manager.can_view_global ? "bg-[#13b6ec]" : "bg-[#233f48]"
                                    }`}
                                    role="switch"
                                    aria-checked={manager.can_view_global}
                                    aria-label={`Visão Global para ${manager.name || manager.email}`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            manager.can_view_global ? "translate-x-5" : "translate-x-0"
                                        }`}
                                    />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
