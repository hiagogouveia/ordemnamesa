import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`Variável de ambiente ${key} não configurada`);
    return v;
}

export function getSupabaseUrl(): string {
    return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

/** Cliente anônimo (sem JWT) — simula visitante não autenticado. */
export function createAnonClient(): SupabaseClient {
    return createClient(getSupabaseUrl(), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

/** Cliente authenticated com JWT real — usado em testes de RLS. */
export function createAuthenticatedClient(accessToken: string): SupabaseClient {
    return createClient(getSupabaseUrl(), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

/**
 * Cliente service-role — só para provisionamento e auditoria.
 * NUNCA usar dentro de assertion de teste de RLS (bypassa RLS).
 */
export function createServiceClient(): SupabaseClient {
    return createClient(getSupabaseUrl(), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
