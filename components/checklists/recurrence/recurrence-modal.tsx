"use client";

import type { ReactNode } from "react";

interface RecurrenceModalProps {
    title: string;
    children: ReactNode;
    /**
     * Quando `false`, o botão Confirmar fica desabilitado. Útil para enforce
     * "weekly precisa de pelo menos 1 dia", "diário não pode excluir os 7", etc.
     */
    canConfirm: boolean;
    /** Mensagem auxiliar mostrada ao lado do Confirmar quando inválido. */
    invalidHint?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Wrapper visual padronizado para os modais de configuração de recorrência.
 * Mantém header / body / footer consistentes — cada modal específico injeta
 * apenas o conteúdo (campos + preview).
 */
export function RecurrenceModal({
    title,
    children,
    canConfirm,
    invalidHint,
    onConfirm,
    onCancel,
}: RecurrenceModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-[440px] flex flex-col shadow-2xl max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#233f48] shrink-0">
                    <h2 className="text-white font-bold text-base">{title}</h2>
                    <button
                        onClick={onCancel}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors"
                        aria-label="Fechar"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-5 overflow-y-auto">
                    {children}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 p-4 border-t border-[#233f48] shrink-0">
                    {!canConfirm && invalidHint && (
                        <span className="text-amber-400 text-xs flex-1">{invalidHint}</span>
                    )}
                    <div className="flex gap-3 ml-auto">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2.5 rounded-xl bg-[#233f48] text-white font-bold text-sm hover:bg-[#2c4e5a] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={!canConfirm}
                            className="px-5 py-2.5 rounded-xl bg-[#13b6ec] text-[#0a1215] font-bold text-sm hover:bg-[#10a1d4] transition-colors shadow-[0_4px_14px_0_rgba(19,182,236,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
