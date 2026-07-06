/**
 * Utilitários compartilhados entre os geradores de PDF client-side
 * (rotinas e auditoria). Sem dependência de negócio — só I/O de imagem,
 * disparo de download e formatação de data.
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

/** Caminho de download único para todos os dispositivos (desktop e mobile). */
export function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revogação adiada: alguns navegadores mobile (iOS Safari) abortam o
    // download se a object URL for liberada cedo demais. 10s é folga suficiente.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Data/hora legível em pt-BR no fuso do navegador. */
export function formatNowBR(date: Date = new Date()): string {
    return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
