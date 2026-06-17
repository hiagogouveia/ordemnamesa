import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_BUCKET = 'photos';

/**
 * Normaliza uma referência de foto para o path dentro do bucket 'photos'.
 * As refs são gravadas como path puro (`restaurant_id/exec_id/arquivo.jpg`),
 * mas normalizamos defensivamente caso alguma legada tenha vindo como URL completa.
 */
export function toStoragePath(ref: string): string {
    const marker = '/photos/';
    const i = ref.indexOf(marker);
    return i >= 0 ? ref.slice(i + marker.length) : ref;
}

/** Coleta paths únicos de linhas com `photo_url` (text, legado) e/ou `photos` (jsonb array). */
export function collectExecutionPhotoPaths(
    rows: Array<{ photo_url?: string | null; photos?: unknown }>
): string[] {
    const set = new Set<string>();
    for (const r of rows) {
        if (typeof r.photo_url === 'string' && r.photo_url) set.add(toStoragePath(r.photo_url));
        if (Array.isArray(r.photos)) {
            for (const p of r.photos) if (typeof p === 'string' && p) set.add(toStoragePath(p));
        }
    }
    return [...set];
}

/** Coleta paths de `task_issues.photos` (text[]). */
export function collectIssuePhotoPaths(rows: Array<{ photos?: string[] | null }>): string[] {
    const set = new Set<string>();
    for (const r of rows) {
        if (Array.isArray(r.photos)) {
            for (const p of r.photos) if (typeof p === 'string' && p) set.add(toStoragePath(p));
        }
    }
    return [...set];
}

/**
 * Remove arquivos do bucket 'photos'. NUNCA lança: uma falha de storage só pode
 * gerar órfão (limpo depois pela retenção/script de órfãos), nunca derrubar a
 * request de delete nem deixar referência quebrada no banco.
 */
export async function removePhotosBestEffort(
    admin: SupabaseClient,
    paths: string[]
): Promise<void> {
    if (paths.length === 0) return;
    try {
        const { error } = await admin.storage.from(STORAGE_BUCKET).remove(paths);
        if (error) {
            console.error('[Storage Cleanup] remove falhou:', error.message);
        }
    } catch (e) {
        console.error('[Storage Cleanup] remove exception:', e);
    }
}
