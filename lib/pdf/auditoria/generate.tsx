import type { AuditExecutionDetail } from "@/lib/types/audit";
import type { AuditDocumentData } from "./format";
import { collectImageUrls } from "./format";
import { loadImageAsDataUrl } from "@/lib/pdf/shared";

/**
 * Camada de renderização do PDF de auditoria. Sem orquestração de rede — a
 * busca de detalhes, o progresso e o cancelamento vivem no hook
 * `use-export-relatorios-lote`. Aqui só: carregar imagens e emitir o blob.
 *
 * `@react-pdf/renderer` e o Document entram via `import()` dinâmico — só no
 * bundle quando o usuário exporta.
 */

/** Logo da marca (asset estático same-origin, sem CORS). */
export const BRAND_LOGO_URL = "/logo-icon.png";

/**
 * Pré-carrega as fotos de UM detalhe como data URLs (modo Completo).
 * Retorna Map<signed_url, dataUrl>; URLs que falharem ficam de fora (a foto é
 * então omitida do documento — erro parcial silencioso, não quebra o lote).
 */
export async function loadImagesForDetail(
    detail: AuditExecutionDetail,
): Promise<Map<string, string>> {
    const urls = collectImageUrls(detail);
    const map = new Map<string, string>();
    // Sequencial dentro do relatório para não abrir dezenas de fetches simultâneos.
    for (const url of urls) {
        const dataUrl = await loadImageAsDataUrl(url);
        if (dataUrl) map.set(url, dataUrl);
    }
    return map;
}

/** Renderiza o Document completo em um único blob (PDF combinado — §4). */
export async function renderAuditoriaPdfBlob(data: AuditDocumentData): Promise<Blob> {
    const [{ pdf }, { AuditoriaDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/auditoria/AuditoriaDocument"),
    ]);
    return pdf(<AuditoriaDocument data={data} />).toBlob();
}

/** Nome do arquivo do lote. */
export function buildAuditBatchFilename(count: number, date: Date = new Date()): string {
    const stamp = date.toISOString().slice(0, 10);
    const suffix = count === 1 ? "relatorio" : "relatorios";
    return `auditoria_${count}_${suffix}_${stamp}.pdf`;
}
