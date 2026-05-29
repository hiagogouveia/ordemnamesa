"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { TemplatesList } from "./_components/templates-list";
import { ExecutionsList } from "./_components/executions-list";

type TabId = "modelos" | "execucoes";
const VALID_TABS: TabId[] = ["modelos", "execucoes"];

export default function RecebimentosPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const restaurantId = useRestaurantStore((s) => s.restaurantId);

    const urlTab = searchParams.get("tab");
    const initialTab: TabId = VALID_TABS.includes(urlTab as TabId) ? (urlTab as TabId) : "modelos";
    const [activeTab, setActiveTabState] = useState<TabId>(initialTab);

    const setActiveTab = useCallback(
        (t: TabId) => {
            setActiveTabState(t);
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", t);
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [router, pathname, searchParams],
    );

    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <div className="bg-[#16262c] border-b border-[#233f48] px-6 py-6 lg:py-8 flex flex-col gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1 font-fraunces">Recebimentos</h1>
                    <p className="text-sm text-[#92bbc9]">
                        Gerencie os modelos de recebimento e acompanhe as execuções do restaurante.
                    </p>
                </div>

                <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-[#233f48] -mb-6 lg:-mb-8">
                    <button
                        onClick={() => setActiveTab("modelos")}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                            activeTab === "modelos"
                                ? "border-[#13b6ec] text-[#13b6ec]"
                                : "border-transparent text-[#92bbc9] hover:text-white"
                        }`}
                    >
                        Modelos
                    </button>
                    <button
                        onClick={() => setActiveTab("execucoes")}
                        className={`pb-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                            activeTab === "execucoes"
                                ? "border-[#13b6ec] text-[#13b6ec]"
                                : "border-transparent text-[#92bbc9] hover:text-white"
                        }`}
                    >
                        Execuções
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {activeTab === "modelos" && <TemplatesList restaurantId={restaurantId ?? undefined} />}
                {activeTab === "execucoes" && <ExecutionsList restaurantId={restaurantId ?? undefined} />}
            </div>
        </div>
    );
}
