/**
 * Geração e sanitização de nomes de arquivo para o PDF de rotinas.
 * Sem dependências de UI — pura função.
 */

/** Remove acentos, baixa caixa e troca não-alfanuméricos por hífen. */
export function slugify(input: string): string {
    return input
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}

/** "YYYY-MM-DD" a partir de uma data (default: agora). */
export function isoDate(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export interface FilenameParams {
    routineNames: string[];
    restaurantName: string;
    date?: Date;
}

/**
 * 1 rotina  → "rotina-<slug-do-nome>.pdf"
 * N rotinas → "rotinas-operacionais-<slug-restaurante>-YYYY-MM-DD.pdf"
 */
export function buildPdfFilename({
    routineNames,
    restaurantName,
    date = new Date(),
}: FilenameParams): string {
    if (routineNames.length === 1) {
        const slug = slugify(routineNames[0]) || "rotina";
        return `rotina-${slug}.pdf`;
    }
    const restaurantSlug = slugify(restaurantName) || "restaurante";
    return `rotinas-operacionais-${restaurantSlug}-${isoDate(date)}.pdf`;
}
