import { createClient } from '@/lib/supabase/client';
import { BRAND_BUCKET, buildBrandLogoPath } from './storage';
import type { NormalizedLogo } from './normalize';

/**
 * Sprint 93 — Upload da logo já normalizada para o bucket `brand`.
 *
 * Segue o mesmo padrão de `uploadEvidencePhoto` (lib/supabase/storage.ts): upload
 * direto do browser, protegido por RLS — o servidor não intermedia bytes. A policy
 * `Account owners can upload brand assets` valida que o 1º segmento do path é uma
 * account da qual o usuário é owner ativo.
 *
 * `cacheControl` de 1 ano é seguro justamente porque o nome do arquivo carrega o
 * hash do conteúdo: trocar a logo produz outra URL, então navegador, CDN e o
 * otimizador de imagem do Next não têm como servir bytes velhos. Não existe cache
 * a invalidar — é o que elimina o cache-bust manual (`?v=...`) que hoje existe em
 * app/imprimir/relatorios/[id]/page.tsx.
 */
export async function uploadBrandLogo(
    normalized: NormalizedLogo,
    accountId: string,
    restaurantId: string | null
): Promise<string> {
    const supabase = createClient();
    const path = buildBrandLogoPath(accountId, restaurantId, normalized.contentHash);

    const { error } = await supabase.storage.from(BRAND_BUCKET).upload(path, normalized.blob, {
        cacheControl: '31536000',
        contentType: 'image/png',
        // upsert: reenviar exatamente a mesma imagem gera o mesmo hash e portanto o
        // mesmo path. Sem isso, um "salvar" repetido falharia com 409.
        upsert: true,
    });

    if (error) {
        console.error('[Brand Upload Error]', error);
        throw new Error(`Falha ao enviar a logo: ${error.message}`);
    }

    return path;
}

/** Remove um objeto do bucket `brand`. Best-effort: falha não deve travar o fluxo. */
export async function deleteBrandAsset(path: string | null | undefined): Promise<void> {
    if (!path) return;
    try {
        const supabase = createClient();
        await supabase.storage.from(BRAND_BUCKET).remove([path]);
    } catch (err) {
        console.warn('[Brand Delete Warn] órfão deixado no storage', path, err);
    }
}
