"use client";

import { useState } from "react";
import { ShiftsTab } from "./_components/shifts-tab";
import { AreasTab } from "./_components/areas-tab";
import { UnidadesTab } from "./_components/unidades-tab";

type TabId = "unidades" | "turnos" | "funcoes" | "geral";

export default function ConfiguracoesPage() {
    const [activeTab, setActiveTab] = useState<TabId>("unidades");

    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <div className="bg-[#16262c] border-b border-[#233f48] px-6 py-6 lg:py-8 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1 font-fraunces">Configurações</h1>
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
                {activeTab === "unidades" && <UnidadesTab />}
                {activeTab === "turnos" && <ShiftsTab />}
                {activeTab === "funcoes" && <AreasTab />}
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
