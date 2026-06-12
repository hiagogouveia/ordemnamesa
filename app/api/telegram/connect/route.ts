import { NextResponse } from "next/server"
import {
    getAdminSupabase,
    requireOwnerOrManager,
    generateLinkToken,
    buildDeepLink,
    getBotUsername,
    TELEGRAM_LINK_TOKEN_TTL_MS,
} from "@/lib/notifications/telegram/server"
import { notificationLog } from "@/lib/notifications/log"

export const runtime = "nodejs"

/**
 * POST /api/telegram/connect
 * Body: { restaurant_id }
 *
 * Gera um token temporário de vínculo e retorna a instrução para o usuário
 * enviar "/start TOKEN" ao bot. Owner/manager apenas.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const { restaurant_id } = body as { restaurant_id?: string }

        const admin = getAdminSupabase()
        const check = await requireOwnerOrManager(request, restaurant_id, admin)
        if ("error" in check) {
            return NextResponse.json({ error: check.error }, { status: check.status })
        }
        const userId = check.auth.user.id

        // Invalida tokens anteriores não usados (mantém só o mais recente válido).
        await admin
            .from("telegram_link_tokens")
            .update({ used_at: new Date().toISOString() })
            .eq("user_id", userId)
            .is("used_at", null)

        // Gera token único (retry em colisão improvável).
        let token = generateLinkToken()
        const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TOKEN_TTL_MS).toISOString()

        let inserted = false
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
            const { error } = await admin
                .from("telegram_link_tokens")
                .insert({ user_id: userId, token, expires_at: expiresAt })
            if (!error) {
                inserted = true
            } else if (error.code === "23505") {
                token = generateLinkToken() // colisão: novo token
            } else {
                notificationLog.error({ op: "link", channel: "telegram", user_id: userId, msg: error.message })
                return NextResponse.json({ error: "Falha ao gerar token de vínculo." }, { status: 500 })
            }
        }
        if (!inserted) {
            return NextResponse.json({ error: "Falha ao gerar token de vínculo." }, { status: 500 })
        }

        notificationLog.info({ op: "link", channel: "telegram", user_id: userId, action: "token_generated" })

        return NextResponse.json({
            token,
            deep_link: buildDeepLink(token),
            bot_username: getBotUsername(),
            expires_at: expiresAt,
        })
    } catch (error: unknown) {
        console.error("[POST /api/telegram/connect] Erro inesperado:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
