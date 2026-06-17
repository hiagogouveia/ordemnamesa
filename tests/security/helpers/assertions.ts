import { expect } from "vitest";

interface SupabaseResponse<T> {
    data: T | null;
    error: { message: string; code?: string } | null;
}

/**
 * Em PostgREST + RLS, uma operação bloqueada pode retornar:
 *  - `error.code === '42501'` (insufficient_privilege) em INSERT/UPDATE/DELETE
 *  - linhas vazias (`data === []`) em SELECT (RLS filtra silenciosamente)
 *
 * `expectRlsDenied` aceita ambos e falha se a operação devolveu dados.
 */
export function expectRlsDenied<T>(
    response: SupabaseResponse<T>,
    label?: string,
): void {
    const tag = label ? ` [${label}]` : "";
    if (response.error) {
        // Bloqueio explícito é o caminho preferido. Aceita códigos comuns.
        expect(
            response.error.code === "42501" ||
                response.error.code === "PGRST301" || // PostgREST: not found / RLS hidden
                /row-level security|policy|permission denied/i.test(
                    response.error.message,
                ),
            `Erro inesperado${tag}: ${response.error.message}`,
        ).toBe(true);
        return;
    }
    if (Array.isArray(response.data)) {
        expect(
            response.data.length,
            `RLS deveria ter bloqueado${tag}, mas retornou ${response.data.length} linha(s)`,
        ).toBe(0);
        return;
    }
    expect(
        response.data,
        `RLS deveria ter bloqueado${tag}, mas retornou data não-vazia`,
    ).toBeNull();
}

/** Açúcar semântico: SELECT cross-tenant retornar 0 linhas. */
export function expectCrossTenantDenied<T>(
    response: SupabaseResponse<T[]>,
    label?: string,
): void {
    expectRlsDenied(response, label ?? "cross-tenant");
}

/** Operação que deveria ter sucesso. */
export function expectOk<T>(response: SupabaseResponse<T>, label?: string): T {
    const tag = label ? ` [${label}]` : "";
    expect(
        response.error,
        `Esperado sucesso${tag}, mas houve erro: ${response.error?.message}`,
    ).toBeNull();
    expect(response.data, `Esperado data não-nulo${tag}`).not.toBeNull();
    return response.data as T;
}
