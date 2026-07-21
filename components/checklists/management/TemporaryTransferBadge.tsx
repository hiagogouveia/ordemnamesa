"use client";

import type { TemporaryTransfer } from "@/lib/types";
import { describeTransferPeriod, formatShortBR, reasonLabel } from "@/lib/utils/temporary-transfer";

/**
 * Sprint 94 — indicador DISCRETO de transferência temporária.
 *
 * Só o ícone + "Temporário"; todo o detalhe (original, atual, período, motivo) vive no
 * `title`. A listagem já carrega badge de tipo, de ocorrências, de unidade e de status —
 * mais um bloco visível competiria com eles por atenção sem acrescentar decisão.
 *
 * Componente próprio (e não JSX repetido) porque ChecklistRow e SortableChecklistRow
 * renderiam exatamente o mesmo — e o `title` é longo o bastante para divergir na
 * primeira edição feita em só um dos dois.
 */
export function TemporaryTransferBadge({ transfer }: { transfer: TemporaryTransfer }) {
    const isScheduled = transfer.status === "scheduled";
    const motivo = reasonLabel(transfer.reason_code);

    const tooltip = [
        isScheduled ? "Transferência temporária agendada" : "Transferida temporariamente",
        `Original: ${transfer.original?.name ?? "—"}`,
        `Atual: ${transfer.temporary?.name ?? "—"}`,
        isScheduled
            ? `A partir de: ${formatShortBR(transfer.starts_on)}`
            : `Até: ${formatShortBR(transfer.ends_on)}`,
        `Período: ${describeTransferPeriod(transfer.starts_on, transfer.ends_on)}`,
        motivo ? `Motivo: ${motivo}${transfer.reason_note ? ` — ${transfer.reason_note}` : ""}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    return (
        <span
            title={tooltip}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${
                isScheduled
                    ? "bg-[#16262c] text-[#92bbc9] border-[#233f48]"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
            }`}
        >
            <span className="material-symbols-outlined text-[11px]">swap_horiz</span>
            {isScheduled ? "Agendada" : "Temporário"}
        </span>
    );
}
