/**
 * Sprint 93 — Normalização client-side da logo antes do upload.
 *
 * Corrigir a imagem na entrada é muito mais eficaz que CSS defensivo na saída:
 * uma vez normalizada, ela se comporta em TODAS as superfícies (sidebar, header,
 * navs, PDF, impressão) sem regra especial em nenhuma.
 *
 * Pipeline: decodifica → auto-trim de bordas vazias → valida → redimensiona → PNG.
 *
 * Por que PNG e não WebP: é o único formato suportado simultaneamente por
 * `next/image`, `@react-pdf/renderer` (que só aceita JPG/PNG) e impressão, e o
 * único desses com transparência. WebP quebraria os PDFs sem erro visível.
 *
 * Nota: NÃO usamos `browser-image-compression` aqui (usado em lib/supabase/storage.ts
 * para fotos de evidência). Ele força um re-encode com qualidade lossy e não faz
 * trim — e como o trim já exige canvas, encodar o PNG no mesmo canvas evita um
 * segundo passe inútil. PNG é lossless, então não há qualidade a ajustar.
 */

/** Teto de ENTRADA, antes da normalização. Espelha file_size_limit do bucket. */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Lado maior da imagem final. 512 cobre com folga o maior slot (PDF, 180px @2x). */
export const MAX_OUTPUT_DIMENSION = 512;

/** Abaixo disso a logo apareceria borrada em qualquer slot. */
export const MIN_INPUT_DIMENSION = 64;

/**
 * Proporção máxima aceita (e seu inverso). Acima disso quase nunca é uma logo —
 * é banner ou print de tela. Rejeitar com mensagem clara é melhor que aceitar e
 * deixar o layout estranho.
 */
export const MAX_ASPECT_RATIO = 5;

export const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Alpha acima do qual um pixel conta como "conteúdo" no auto-trim. */
const ALPHA_THRESHOLD = 10;

/** Tolerância por canal ao detectar borda de cor uniforme (imagens sem alpha). */
const COLOR_TOLERANCE = 12;

/** Working canvas antes do trim — limita o custo de getImageData em imagens enormes. */
const TRIM_WORKING_MAX = 1024;

export class LogoValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LogoValidationError';
    }
}

export interface NormalizedLogo {
    /** PNG pronto para upload. */
    blob: Blob;
    /** Hash de conteúdo (8 hex) — vira o nome do arquivo e torna a URL imutável. */
    contentHash: string;
    width: number;
    height: number;
    bytes: number;
    /** Object URL para prévia. O chamador deve revogar quando descartar. */
    previewUrl: string;
    /** true se o auto-trim removeu margem — usado para explicar a mudança na UI. */
    trimmed: boolean;
}

/** Decodifica um File em HTMLImageElement, com object URL liberado ao final. */
function decodeImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new LogoValidationError('Não foi possível ler a imagem. Tente outro arquivo.'));
        };
        img.src = url;
    });
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
}

interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/**
 * Bounding box do conteúdo real.
 *
 * Duas estratégias, escolhidas pelo próprio conteúdo:
 *  - com transparência (PNG/WebP): recorta pelo alpha;
 *  - sem transparência (JPEG): recorta a moldura de cor uniforme, inferida pelos
 *    quatro cantos. Se os cantos discordarem, a imagem tem fundo real e não há
 *    moldura a remover — devolve a caixa inteira.
 *
 * Resolve o problema nº 1 na prática: logo exportada do Figma com 30% de margem
 * vazia aparecendo minúscula dentro do slot.
 */
function findContentBox(data: Uint8ClampedArray, width: number, height: number): Box {
    const full: Box = { left: 0, top: 0, right: width - 1, bottom: height - 1 };

    let hasAlpha = false;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
            hasAlpha = true;
            break;
        }
    }

    const at = (x: number, y: number) => (y * width + x) * 4;

    let isBackground: (x: number, y: number) => boolean;

    if (hasAlpha) {
        isBackground = (x, y) => data[at(x, y) + 3] <= ALPHA_THRESHOLD;
    } else {
        const corners = [
            at(0, 0),
            at(width - 1, 0),
            at(0, height - 1),
            at(width - 1, height - 1),
        ];
        const [r0, g0, b0] = [data[corners[0]], data[corners[0] + 1], data[corners[0] + 2]];
        const cornersAgree = corners.every(
            (c) =>
                Math.abs(data[c] - r0) <= COLOR_TOLERANCE &&
                Math.abs(data[c + 1] - g0) <= COLOR_TOLERANCE &&
                Math.abs(data[c + 2] - b0) <= COLOR_TOLERANCE
        );
        if (!cornersAgree) return full;

        isBackground = (x, y) => {
            const i = at(x, y);
            return (
                Math.abs(data[i] - r0) <= COLOR_TOLERANCE &&
                Math.abs(data[i + 1] - g0) <= COLOR_TOLERANCE &&
                Math.abs(data[i + 2] - b0) <= COLOR_TOLERANCE
            );
        };
    }

    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isBackground(x, y)) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }

    // Imagem inteiramente "fundo" (ex.: PNG 100% transparente) — nada a recortar.
    if (right < 0 || bottom < 0) return full;

    return { left, top, right, bottom };
}

/** SHA-256 do conteúdo, truncado em 8 hex. Torna a URL imutável e auto-invalidante. */
async function hashBlob(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest).slice(0, 4))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new LogoValidationError('Falha ao processar a imagem.'));
        }, 'image/png');
    });
}

/**
 * Valida, recorta e redimensiona a logo. Lança `LogoValidationError` com mensagem
 * pronta para exibir ao usuário.
 */
export async function normalizeLogo(file: File): Promise<NormalizedLogo> {
    if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
        throw new LogoValidationError('Formato não aceito. Envie um PNG, JPG ou WebP.');
    }
    if (file.size > MAX_INPUT_BYTES) {
        throw new LogoValidationError('A imagem não pode exceder 5 MB.');
    }

    const img = await decodeImage(file);
    const srcWidth = img.naturalWidth;
    const srcHeight = img.naturalHeight;

    if (Math.min(srcWidth, srcHeight) < MIN_INPUT_DIMENSION) {
        throw new LogoValidationError(
            `Imagem pequena demais (${srcWidth}×${srcHeight}px). O menor lado precisa ter ao menos ${MIN_INPUT_DIMENSION}px.`
        );
    }

    // Trabalha numa cópia reduzida: getImageData em 4000×4000 custaria ~64 MB.
    const workScale = Math.min(1, TRIM_WORKING_MAX / Math.max(srcWidth, srcHeight));
    const workWidth = Math.round(srcWidth * workScale);
    const workHeight = Math.round(srcHeight * workScale);

    const workCanvas = makeCanvas(workWidth, workHeight);
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
    if (!workCtx) throw new LogoValidationError('Seu navegador não suporta o processamento da imagem.');
    workCtx.drawImage(img, 0, 0, workWidth, workHeight);

    const { data } = workCtx.getImageData(0, 0, workWidth, workHeight);
    const box = findContentBox(data, workWidth, workHeight);

    // Converte a caixa de volta para coordenadas da imagem original — recortar do
    // original preserva a resolução que o trim na cópia reduzida perderia.
    const cropX = Math.floor(box.left / workScale);
    const cropY = Math.floor(box.top / workScale);
    const cropWidth = Math.min(srcWidth - cropX, Math.ceil((box.right - box.left + 1) / workScale));
    const cropHeight = Math.min(srcHeight - cropY, Math.ceil((box.bottom - box.top + 1) / workScale));

    const trimmed = cropWidth < srcWidth * 0.98 || cropHeight < srcHeight * 0.98;

    // A proporção é validada DEPOIS do trim: uma logo quadrada com margem lateral
    // enorme seria injustamente rejeitada se medida antes.
    const aspect = cropWidth / cropHeight;
    if (aspect > MAX_ASPECT_RATIO || aspect < 1 / MAX_ASPECT_RATIO) {
        throw new LogoValidationError(
            `Proporção fora do aceito (${cropWidth}×${cropHeight}px). Use uma imagem entre 1:${MAX_ASPECT_RATIO} e ${MAX_ASPECT_RATIO}:1 — banners e capturas de tela não funcionam bem como logo.`
        );
    }

    const outScale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(cropWidth, cropHeight));
    const outWidth = Math.round(cropWidth * outScale);
    const outHeight = Math.round(cropHeight * outScale);

    const outCanvas = makeCanvas(outWidth, outHeight);
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) throw new LogoValidationError('Seu navegador não suporta o processamento da imagem.');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, outWidth, outHeight);

    const blob = await canvasToPng(outCanvas);
    const contentHash = await hashBlob(blob);

    return {
        blob,
        contentHash,
        width: outWidth,
        height: outHeight,
        bytes: blob.size,
        previewUrl: URL.createObjectURL(blob),
        trimmed,
    };
}

/** Formata bytes para exibição ("48 KB"). */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
