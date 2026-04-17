"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface BulkActionBarProps {
    selectedCount: number;
    onCopyToUnit: () => void;
    onClearSelection: () => void;
}

export function BulkActionBar({
    selectedCount,
    onCopyToUnit,
    onClearSelection,
}: BulkActionBarProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <div
            className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-200 ${
                selectedCount > 0 ? "translate-y-0" : "translate-y-full"
            }`}
        >
            <div className="bg-[#101d22]/95 backdrop-blur-sm border-t border-[#233f48] px-6 py-3">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    {/* Esquerda: contagem + limpar */}
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-2 text-sm text-white font-medium">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#13b6ec]/20 text-[#13b6ec] text-xs font-bold">
                                {selectedCount}
                            </span>
                            {selectedCount === 1 ? "rotina selecionada" : "rotinas selecionadas"}
                        </span>
                        <button
                            onClick={onClearSelection}
                            className="text-xs text-[#92bbc9] hover:text-white transition-colors underline underline-offset-2"
                        >
                            Limpar seleção
                        </button>
                    </div>

                    {/* Direita: ação */}
                    <button
                        onClick={onCopyToUnit}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] rounded-lg transition-colors active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[18px]">content_copy</span>
                        Copiar para outra unidade
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
