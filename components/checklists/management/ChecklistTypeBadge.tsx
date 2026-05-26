"use client";

import type { Checklist } from "@/lib/types";

type Props = {
    type: Checklist["checklist_type"];
    className?: string;
};

/**
 * Badge visual que destaca rotinas de Recebimento.
 * Rotinas operacionais (regular/opening/closing) renderizam null — é o padrão do sistema.
 */
export function ChecklistTypeBadge({ type, className = "" }: Props) {
    if (type !== "receiving") return null;

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border-amber-500/30 text-amber-300 ${className}`}
            title="Rotina de Recebimento"
        >
            <span aria-hidden>📦</span>
            <span>Recebimento</span>
        </span>
    );
}
