// Helpers compartilhados pelos scripts de manutenção de fotos.
import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'photos';

export function makeAdmin(url, key) {
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Normaliza uma referência para o path puro dentro do bucket. */
export function toStoragePath(ref) {
    const marker = '/photos/';
    const i = ref.indexOf(marker);
    return i >= 0 ? ref.slice(i + marker.length) : ref;
}

/**
 * Enumera TODOS os objetos do bucket via Storage API, recursivamente.
 * Estrutura esperada: restaurant_id/execution_id/arquivo. Retorna [{path, size}].
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lista uma página com retry/backoff — Storage API ocasionalmente devolve Gateway Timeout. */
async function listPageWithRetry(admin, prefix, offset, pageSize, attempts = 4) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        const { data, error } = await admin.storage
            .from(BUCKET)
            .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
        if (!error) return data;
        lastErr = error;
        await sleep(500 * (i + 1));
    }
    throw new Error(`list("${prefix}") após ${attempts} tentativas: ${lastErr?.message}`);
}

export async function listAllObjects(admin, prefix = '') {
    const out = [];
    const pageSize = 100;
    let offset = 0;
    for (;;) {
        const data = await listPageWithRetry(admin, prefix, offset, pageSize);
        if (!data || data.length === 0) break;
        for (const entry of data) {
            const full = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.id === null) {
                // É uma "pasta" — desce um nível.
                out.push(...(await listAllObjects(admin, full)));
            } else {
                out.push({ path: full, size: entry.metadata?.size ?? 0 });
            }
        }
        if (data.length < pageSize) break;
        offset += pageSize;
    }
    return out;
}

/**
 * Busca TODAS as linhas de uma tabela paginando com .range().
 * CRÍTICO: sem isto, o PostgREST devolve no máximo 1000 linhas e perderíamos
 * referências (gerando falsos órfãos). task_executions tem milhares de linhas.
 */
async function fetchAllRows(admin, table, columns) {
    const PAGE = 1000;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
            .from(table)
            .select(columns)
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE) break;
    }
    return rows;
}

/** Conjunto de paths referenciados no banco (as 3 fontes). */
export async function fetchReferencedPaths(admin) {
    const set = new Set();
    const execs = await fetchAllRows(admin, 'task_executions', 'photo_url, photos');
    for (const r of execs) {
        if (typeof r.photo_url === 'string' && r.photo_url) set.add(toStoragePath(r.photo_url));
        if (Array.isArray(r.photos)) {
            for (const p of r.photos) if (typeof p === 'string' && p) set.add(toStoragePath(p));
        }
    }
    const issues = await fetchAllRows(admin, 'task_issues', 'photos');
    for (const r of issues) {
        if (Array.isArray(r.photos)) {
            for (const p of r.photos) if (typeof p === 'string' && p) set.add(toStoragePath(p));
        }
    }
    return set;
}

export function fmtMB(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
