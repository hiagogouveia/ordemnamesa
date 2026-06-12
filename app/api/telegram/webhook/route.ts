import { NextResponse } from "next/server"
import { getAdminSupabase, getWebhookSecret } from "@/lib/notifications/telegram/server"
import { sendTelegramMessage } from "@/lib/notifications/telegram/client"
import { notificationLog } from "@/lib/notifications/log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MSG_LINKED =
    "✅ <b>Conta vinculada com sucesso.</b>\n\nAgora você receberá alertas operacionais do Ordem na Mesa."
const MSG_INVALID =
    "⚠️ Token inválido, expirado ou já utilizado.\n\nGere um novo código em Configurações → Notificações → Telegram."
const MSG_HELP =
    "Para vincular sua conta, gere um código em <b>Configurações → Notificações → Telegram</b> no Ordem na Mesa e envie aqui:\n<code>/start SEU_CODIGO</code>"

/** Estrutura mínima de um update do Telegram (só o que usamos). */
interface TelegramUpdate {
    message?: {
        text?: string
        chat?: { id?: number | string }
    }
}

/**
 * POST /api/telegram/webhook
 *
 * Endpoint público. Segurança via header X-Telegram-Bot-Api-Secret-Hash
 * (definido no setWebhook). Service-role (sem sessão de usuário).
 * Sempre responde 200 para evitar reentregas do Telegram.
 */
export async function POST(request: Request) {
    // 1. Valida o segredo do webhook.
    try {
        const provided = request.headers.get("x-telegram-bot-api-secret-hash")
        if (!provided || provided !== getWebhookSecret()) {
            notificationLog.warn({ op: "webhook", channel: "telegram", msg: "secret mismatch" })
            return NextResponse.json({ error: "unauthorized" }, { status: 401 })
        }
    } catch (err) {
        notificationLog.error({ op: "webhook", channel: "telegram", msg: err instanceof Error ? err.message : "secret error" })
        return NextResponse.json({ error: "config" }, { status: 500 })
    }

    try {
        const update = (await request.json().catch(() => ({}))) as TelegramUpdate
        const text = update.message?.text?.trim()
        const chatId = update.message?.chat?.id

        if (!text || chatId === undefined || chatId === null) {
            return NextResponse.json({ ok: true })
        }
        const chatIdStr = String(chatId)

        // Espera "/start TOKEN".
        const match = text.match(/^\/start(?:@\w+)?\s+(\S+)/i)
        if (!match) {
            await sendTelegramMessage(chatIdStr, MSG_HELP)
            return NextResponse.json({ ok: true })
        }

        const token = match[1]
        const admin = getAdminSupabase()

        const { data: linkToken } = await admin
            .from("telegram_link_tokens")
            .select("id, user_id, expires_at, used_at")
            .eq("token", token)
            .maybeSingle()

        const isValid =
            !!linkToken &&
            linkToken.used_at === null &&
            new Date(linkToken.expires_at).getTime() > Date.now()

        if (!isValid || !linkToken) {
            await sendTelegramMessage(chatIdStr, MSG_INVALID)
            return NextResponse.json({ ok: true })
        }

        // Materializa o canal global do usuário (upsert manual: índice único é parcial).
        const { data: existing } = await admin
            .from("notification_channels")
            .select("id")
            .eq("user_id", linkToken.user_id)
            .eq("channel_type", "telegram")
            .is("restaurant_id", null)
            .maybeSingle()

        const nowIso = new Date().toISOString()
        if (existing) {
            await admin
                .from("notification_channels")
                .update({ external_id: chatIdStr, is_active: true, updated_at: nowIso })
                .eq("id", existing.id)
        } else {
            await admin.from("notification_channels").insert({
                user_id: linkToken.user_id,
                restaurant_id: null,
                channel_type: "telegram",
                external_id: chatIdStr,
                is_active: true,
            })
        }

        // Marca o token como usado (idempotência do vínculo).
        await admin
            .from("telegram_link_tokens")
            .update({ used_at: nowIso })
            .eq("id", linkToken.id)
            .is("used_at", null)

        await sendTelegramMessage(chatIdStr, MSG_LINKED)
        notificationLog.info({ op: "webhook", channel: "telegram", user_id: linkToken.user_id, action: "linked" })

        return NextResponse.json({ ok: true })
    } catch (error: unknown) {
        // Não retornamos erro para o Telegram não reentregar; só logamos.
        notificationLog.error({
            op: "webhook",
            channel: "telegram",
            msg: error instanceof Error ? error.message : "unexpected",
        })
        return NextResponse.json({ ok: true })
    }
}
