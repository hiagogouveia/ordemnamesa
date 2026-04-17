/**
 * Helper centralizado para persistência de rascunhos de checklist no localStorage.
 *
 * Todas as chaves são escopadas por restaurant_id para garantir isolamento multi-tenant.
 * Nenhum componente deve acessar localStorage diretamente para drafts.
 *
 * Formato das chaves:
 *   - Nova rotina:      draft:checklist:new:{restaurantId}
 *   - Rotina existente: draft:checklist:{checklistId}
 *
 * Chaves legadas (sem escopo de tenant) são limpas automaticamente na leitura.
 */

const PREFIX = "draft:checklist";
const LEGACY_KEY = "ordem_na_mesa_draft_rotina";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DraftData = Record<string, any>;

function keyForNew(restaurantId: string): string {
    return `${PREFIX}:new:${restaurantId}`;
}

function keyForExisting(checklistId: string): string {
    return `${PREFIX}:${checklistId}`;
}

/** Remove chaves legadas sem escopo de tenant (migração one-time). */
function clearLegacy(): void {
    try {
        localStorage.removeItem(LEGACY_KEY);
    } catch {
        // SSR ou localStorage indisponível — silenciar
    }
}

/**
 * Resolve a chave correta baseado no contexto (novo ou existente).
 * Retorna null se restaurantId for necessário mas ausente.
 */
function resolveKey(checklistId: string | null, restaurantId: string | null): string | null {
    if (checklistId) return keyForExisting(checklistId);
    if (restaurantId) return keyForNew(restaurantId);
    return null;
}

/** Lê o rascunho do localStorage. Retorna null se não existir ou for inválido. */
export function getDraft(checklistId: string | null, restaurantId: string | null): DraftData | null {
    clearLegacy();

    const key = resolveKey(checklistId, restaurantId);
    if (!key) return null;

    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as DraftData;
    } catch {
        // JSON inválido — remover entrada corrompida
        if (key) {
            try { localStorage.removeItem(key); } catch { /* noop */ }
        }
        return null;
    }
}

/** Salva o rascunho no localStorage. Não faz nada se a chave não puder ser resolvida. */
export function saveDraft(checklistId: string | null, restaurantId: string | null, data: DraftData): void {
    const key = resolveKey(checklistId, restaurantId);
    if (!key) return;

    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch {
        // QuotaExceeded ou SSR — silenciar
    }
}

/** Remove o rascunho do localStorage. */
export function removeDraft(checklistId: string | null, restaurantId: string | null): void {
    clearLegacy();

    const key = resolveKey(checklistId, restaurantId);
    if (!key) return;

    try {
        localStorage.removeItem(key);
    } catch {
        // noop
    }
}

/** Remove todos os drafts de novas rotinas (todas as unidades). Útil em logout. */
export function clearAllNewDrafts(): void {
    clearLegacy();

    try {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(`${PREFIX}:new:`)) {
                toRemove.push(k);
            }
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
        // noop
    }
}
