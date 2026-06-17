import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"

/**
 * Helpers server-side compartilhados pelas API routes do Telegram.
 * Token do bot e webhook secret vivem só aqui / em runtime — nunca no frontend.
 */

export const TELEGRAM_LINK_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 min
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sem 0/O/1/I
const TOKEN_LENGTH = 8

export function getAdminSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    )
}

export function getBotUsername(): string {
    return process.env.TELEGRAM_BOT_USERNAME || "ordem_na_mesa_alertas_bot"
}

export function getWebhookSecret(): string {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET ausente")
    return secret
}

export function buildDeepLink(token: string): string {
    return `https://t.me/${getBotUsername()}?start=${token}`
}

/** Gera um token curto, legível e de uso único (8 chars, alfabeto reduzido). */
export function generateLinkToken(): string {
    const bytes = randomBytes(TOKEN_LENGTH)
    let out = ""
    for (let i = 0; i < TOKEN_LENGTH; i++) {
        out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length]
    }
    return out
}

export interface AuthResult {
    user: { id: string }
    role: "owner" | "manager" | "staff"
}

/**
 * Autentica via Bearer token e exige papel owner/manager no restaurante.
 * Retorna { error, status } em caso de falha, ou { auth } em caso de sucesso.
 */
export async function requireOwnerOrManager(
    request: Request,
    restaurantId: string | null | undefined,
    admin: SupabaseClient,
): Promise<{ error: string; status: number } | { auth: AuthResult }> {
    if (!restaurantId) {
        return { error: "restaurant_id é obrigatório.", status: 400 }
    }

    const authHeader = request.headers.get("Authorization")
    if (!authHeader) {
        return { error: "Não autorizado. Token ausente.", status: 401 }
    }
    const token = authHeader.replace("Bearer ", "")

    const { data: { user }, error: userError } = await admin.auth.getUser(token)
    if (userError || !user) {
        return { error: "Não autorizado.", status: 401 }
    }

    const { data: membership } = await admin
        .from("restaurant_users")
        .select("role")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", user.id)
        .eq("active", true)
        .single()

    if (!membership) {
        return { error: "Acesso ao restaurante não encontrado.", status: 403 }
    }
    if (membership.role === "staff") {
        return { error: "Permissão negada. Apenas owner/manager.", status: 403 }
    }

    return { auth: { user: { id: user.id }, role: membership.role as AuthResult["role"] } }
}
