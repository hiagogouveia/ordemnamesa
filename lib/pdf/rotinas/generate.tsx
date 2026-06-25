import type { Checklist } from "@/lib/types";
import { buildDocumentData } from "./format";
import { buildPdfFilename } from "./filename";

/**
 * Orquestra a geração do PDF de rotinas no cliente.
 *
 * `@react-pdf/renderer` e os componentes do documento são carregados via
 * `import()` dinâmico — só entram no bundle quando o usuário realmente exporta,
 * mantendo o JS inicial da tela de checklists leve.
 */

/** Baixa uma imagem e a converte em data URL (para embutir no PDF de forma
 *  determinística). Retorna `undefined` em qualquer falha (CORS, 404, etc.). */
export async function loadImageAsDataUrl(
    url: string | null | undefined,
): Promise<string | undefined> {
    if (!url) return undefined;
    try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) return undefined;
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) return undefined;
        return await new Promise<string | undefined>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () =>
                resolve(typeof reader.result === "string" ? reader.result : undefined);
            reader.onerror = () => resolve(undefined);
            reader.readAsDataURL(blob);
        });
    } catch {
        return undefined;
    }
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoga no próximo tick para garantir que o download iniciou.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Data/hora legível em pt-BR no fuso do navegador. */
function formatNow(date: Date = new Date()): string {
    return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export interface GenerateRotinasPdfParams {
    checklists: Checklist[];
    restaurantName: string;
    exportedBy: string;
    logoUrl?: string | null;
}

export async function generateRotinasPdf(
    params: GenerateRotinasPdfParams,
): Promise<void> {
    if (params.checklists.length === 0) {
        throw new Error("Nenhuma rotina selecionada para exportar.");
    }

    const now = new Date();
    const [{ pdf }, { RotinasDocument }, logoDataUrl] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/rotinas/RotinasDocument"),
        loadImageAsDataUrl(params.logoUrl),
    ]);

    const data = buildDocumentData({
        checklists: params.checklists,
        restaurantName: params.restaurantName,
        exportedBy: params.exportedBy,
        generatedAt: formatNow(now),
        logoDataUrl,
    });

    const blob = await pdf(<RotinasDocument data={data} />).toBlob();

    const filename = buildPdfFilename({
        routineNames: params.checklists.map((c) => c.name),
        restaurantName: params.restaurantName,
        date: now,
    });

    triggerDownload(blob, filename);
}
