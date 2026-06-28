"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface BulkActionBarProps {
    selectedCount: number;
    onExportPdf: () => void;
    onClearSelection: () => void;
    /** Exportação em andamento — desabilita o botão e mostra spinner. */
    isExporting?: boolean;
    /** Copiar entre unidades só faz sentido na visão global. */
    canCopy?: boolean;
    onCopyToUnit?: () => void;
    /** Transferir responsável — só na visão de unidade única. */
    canTransfer?: boolean;
    onTransfer?: () => void;
    transferDisabled?: boolean;
    transferDisabledReason?: string;
}

export function BulkActionBar({
    selectedCount,
    onExportPdf,
    onClearSelection,
    isExporting = false,
    canCopy = false,
    onCopyToUnit,
    canTransfer = false,
    onTransfer,
    transferDisabled = false,
    transferDisabledReason,
}: BulkActionBarProps) {
    const [mounted, setMounted] = useState(false);
    const barRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Publica altura real da barra como CSS var no <body>,
    // para que containers scrolláveis reservem padding-bottom sem magic numbers.
    useEffect(() => {
        const el = barRef.current;
        if (!el) return;

        const setVar = () => {
            const h = selectedCount > 0 ? el.getBoundingClientRect().height : 0;
            document.body.style.setProperty("--bulk-action-bar-h", `${Math.ceil(h)}px`);
        };

        setVar();
        const ro = new ResizeObserver(setVar);
        ro.observe(el);
        window.addEventListener("resize", setVar);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", setVar);
            document.body.style.setProperty("--bulk-action-bar-h", "0px");
        };
    }, [selectedCount]);

    if (!mounted) return null;

    return createPortal(
        <div
            ref={barRef}
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

                    {/* Direita: ações */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onExportPdf}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] rounded-lg transition-colors active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <span
                                className={`material-symbols-outlined text-[18px] ${
                                    isExporting ? "animate-spin" : ""
                                }`}
                            >
                                {isExporting ? "progress_activity" : "picture_as_pdf"}
                            </span>
                            {isExporting ? "Gerando PDF…" : "Exportar PDF"}
                        </button>
                        {canTransfer && onTransfer && (
                            <button
                                onClick={onTransfer}
                                disabled={transferDisabled}
                                title={transferDisabled ? transferDisabledReason : undefined}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-transparent border border-[#233f48] hover:bg-[#16262c] text-white rounded-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                                <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                                Transferir responsável
                            </button>
                        )}
                        {canCopy && onCopyToUnit && (
                            <button
                                onClick={onCopyToUnit}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-transparent border border-[#233f48] hover:bg-[#16262c] text-white rounded-lg transition-colors active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                                Copiar para outra unidade
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
