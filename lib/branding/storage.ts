/**
 * Sprint 93 — Ponte entre o `logo_path` guardado no banco e a URL pública servida
 * pela CDN do Supabase.
 *
 * O banco guarda PATH, nunca URL completa. PROD e NONPROD são projetos Supabase
 * distintos, então uma URL persistida embutiria o host do projeto: restaurar um dump
 * de PROD em NONPROD faria o NONPROD servir imagens do bucket de PROD — vazamento
 * cross-ambiente silencioso, sem erro e sem log. Com path puro, o ambiente é
 * resolvido em runtime e um restore é correto por construção.
 *
 * A montagem é concatenação de string — sem rede, sem client Supabase. Isso mantém
 * `resolveBrand()` puro e utilizável nos geradores de PDF e no servidor.
 */

export const BRAND_BUCKET = 'brand';

/** Segmento de path do escopo "grupo" (o restaurante usa o próprio id). */
export const ACCOUNT_SCOPE_SEGMENT = 'account';

/**
 * Monta a URL pública de um asset do bucket `brand`.
 * Retorna `null` para path ausente/vazio — assim o chamador encadeia o fallback
 * com `??` sem precisar testar string vazia.
 */
export function brandPublicUrl(path: string | null | undefined): string | null {
    if (!path) return null;

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;

    // Os segmentos são gerados por nós (uuid/uuid/logo-hash.png), mas encodamos
    // defensivamente: um path vindo do banco nunca deve poder quebrar a URL.
    const encoded = path
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');

    return `${base.replace(/\/$/, '')}/storage/v1/object/public/${BRAND_BUCKET}/${encoded}`;
}

/**
 * Path canônico de uma logo. O 1º segmento é SEMPRE o `account_id` — é isso que
 * permite à RLS do bucket validar o tenant sem consultar outra tabela, e ao
 * servidor validar posse com um simples `startsWith`.
 *
 * `restaurantId` ausente = logo do grupo.
 */
export function buildBrandLogoPath(
    accountId: string,
    restaurantId: string | null,
    contentHash: string
): string {
    const scope = restaurantId ?? ACCOUNT_SCOPE_SEGMENT;
    return `${accountId}/${scope}/logo-${contentHash}.png`;
}

/**
 * Valida que um path pertence à account informada.
 *
 * Usado no route handler ANTES de persistir: o path chega do cliente, e o cliente
 * é um pedido, nunca uma autoridade (mesma doutrina de lib/hooks/use-tenant-from-url.ts).
 * Rejeita travessia de diretório e qualquer prefixo de outro tenant.
 */
export function isPathOwnedByAccount(path: string, accountId: string): boolean {
    if (!path || !accountId) return false;
    if (path.includes('..') || path.startsWith('/')) return false;
    return path.startsWith(`${accountId}/`);
}
