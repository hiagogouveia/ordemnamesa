"use client";

import { useState, useMemo } from "react";
import { ShiftsTab } from "./_components/shifts-tab";
import { AreasTab } from "./_components/areas-tab";
import { UnidadesTab } from "./_components/unidades-tab";
import { ContaTab } from "./_components/conta-tab";
import { PlanoTab } from "./_components/plano-tab";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { useAccountUnits } from "@/lib/hooks/use-account-units";

type TabId = "unidades" | "turnos" | "funcoes" | "conta" | "plano" | "geral";

export default function ConfiguracoesPage() {
    const [activeTab, setActiveTab] = useState<TabId>("unidades");
    const userRole = useRestaurantStore((s) => s.userRole);
    const accountMode = useAccountSessionStore((s) => s.mode);
    const accountId = useAccountSessionStore((s) => s.accountId);
    const isGlobal = accountMode === 'global';
    const isOwner = userRole === "owner" || isGlobal;

    // Em global, buscar unidades da conta para o seletor
    const { data: accountUnits = [] } = useAccountUnits(isGlobal ? accountId : undefined);
    const [selectedUnitId, setSelectedUnitId] = useState<string>('');

    // Auto-select primeira unidade quando dados carregam
    const selectedUnit = useMemo(() => {
        if (!isGlobal || accountUnits.length === 0) return null;
        const id = selectedUnitId || accountUnits[0]?.id;
        return accountUnits.find(u => u.id === id) || accountUnits[0];
    }, [isGlobal, accountUnits, selectedUnitId]);

    // Tabs que precisam de unidade selecionada em modo global
    const needsUnitSelection = isGlobal && (activeTab === 'turnos' || activeTab === 'funcoes');
    const effectiveRestaurantId = isGlobal ? selectedUnit?.id : undefined;

    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <div className="bg-[#16262c] border-b border-[#233f48] px-6 py-6 lg:py-8 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1 font-fraunces">
                            {isGlobal ? 'Configurações — Visão Global' : 'Configurações'}
                        </h1>
                        <p className="text-sm text-[#92bbc9]">
                            Gerencie turnos, áreas e dados da sua operação.
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-[#233f48]">
                    <button
                        onClick={() => setActiveTab("unidades")}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "unidades" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                    >
                        Unidades
                    </button>
                    <button
                        onClick={() => setActiveTab("turnos")}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "turnos" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                    >
                        Turnos
                    </button>
                    <button
                        onClick={() => setActiveTab("funcoes")}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "funcoes" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                    >
                        Áreas
                    </button>
                    {isOwner && (
                        <button
                            onClick={() => setActiveTab("conta")}
                            className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "conta" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                        >
                            Conta
                        </button>
                    )}
                    {isOwner && (
                        <button
                            onClick={() => setActiveTab("plano")}
                            className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "plano" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                        >
                            Plano
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab("geral")}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "geral" ? "border-[#13b6ec] text-[#13b6ec]" : "border-transparent text-[#92bbc9] hover:text-white"}`}
                    >
                        Geral
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                {/* Seletor de unidade (global + tabs que exigem) */}
                {needsUnitSelection && (
                    <div className="mb-6 bg-[#16262c] border border-[#233f48] rounded-xl p-5">
                        <label className="text-sm font-medium text-[#92bbc9] mb-3 block">
                            Selecione a unidade para configurar:
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {accountUnits.map((unit) => (
                                <button
                                    key={unit.id}
                                    onClick={() => setSelectedUnitId(unit.id)}
                                    className={`
                                        px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 border
                                        ${selectedUnit?.id === unit.id
                                            ? 'bg-[#13b6ec]/15 border-[#13b6ec]/50 text-[#13b6ec]'
                                            : 'bg-[#1a2c32] border-[#233f48] text-[#92bbc9] hover:border-[#325a67] hover:text-white'
                                        }
                                    `}
                                >
                                    <span className="material-symbols-outlined text-[16px]">storefront</span>
                                    {unit.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === "unidades" && <UnidadesTab />}
                {activeTab === "turnos" && (
                    needsUnitSelection && !effectiveRestaurantId ? (
                        <div className="flex items-center justify-center min-h-[200px] text-[#92bbc9] text-sm">
                            Selecione uma unidade acima para ver os turnos.
                        </div>
                    ) : (
                        <ShiftsTab overrideRestaurantId={effectiveRestaurantId} />
                    )
                )}
                {activeTab === "funcoes" && (
                    needsUnitSelection && !effectiveRestaurantId ? (
                        <div className="flex items-center justify-center min-h-[200px] text-[#92bbc9] text-sm">
                            Selecione uma unidade acima para ver as áreas.
                        </div>
                    ) : (
                        <AreasTab overrideRestaurantId={effectiveRestaurantId} />
                    )
                )}
                {activeTab === "conta" && <ContaTab />}
                {activeTab === "plano" && <PlanoTab />}
                {activeTab === "geral" && (
                    <div className="flex items-center justify-center h-full min-h-[400px]">
                        <div className="flex flex-col items-center justify-center max-w-sm text-center">
                            <div className="w-16 h-16 rounded-full bg-[#1a2c32] flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-[#325a67] text-3xl">construction</span>
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Em breve</h2>
                            <p className="text-sm text-[#92bbc9]">
                                Opções gerais do restaurante estarão disponíveis em breve nesta seção.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
