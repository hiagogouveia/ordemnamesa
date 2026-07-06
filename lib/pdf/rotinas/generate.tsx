import type { Checklist } from "@/lib/types";
import { buildDocumentData } from "./format";
import { buildPdfFilename } from "./filename";
import { formatNowBR, loadImageAsDataUrl, triggerDownload } from "@/lib/pdf/shared";

/**
 * Orquestra a geração do PDF de rotinas no cliente.
 *
 * `@react-pdf/renderer` e os componentes do documento são carregados via
 * `import()` dinâmico — só entram no bundle quando o usuário realmente exporta,
 * mantendo o JS inicial da tela de checklists leve.
 */

/** Logo do Ordem na Mesa servido como asset estático (public/). */
const BRAND_LOGO_URL = "/logo-icon.png";

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
    const [{ pdf }, { RotinasDocument }, logoDataUrl, brandLogoDataUrl] =
        await Promise.all([
            import("@react-pdf/renderer"),
            import("@/components/pdf/rotinas/RotinasDocument"),
            loadImageAsDataUrl(params.logoUrl),
            // Logo do Ordem na Mesa: asset estático same-origin (sem CORS).
            loadImageAsDataUrl(BRAND_LOGO_URL),
        ]);

    const data = buildDocumentData({
        checklists: params.checklists,
        restaurantName: params.restaurantName,
        exportedBy: params.exportedBy,
        generatedAt: formatNowBR(now),
        logoDataUrl,
        brandLogoDataUrl,
    });

    const blob = await pdf(<RotinasDocument data={data} />).toBlob();

    const filename = buildPdfFilename({
        routineNames: params.checklists.map((c) => c.name),
        restaurantName: params.restaurantName,
        date: now,
    });

    triggerDownload(blob, filename);
}
