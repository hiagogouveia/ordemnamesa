import "server-only"

/**
 * Wrapper fino do Telegram Bot API. O token do bot é lido em runtime e
 * NUNCA exposto ao frontend. Bot único da plataforma.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org"

function getBotToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN ausente")
    return token
}

interface TelegramApiResponse {
    ok: boolean
    description?: string
    result?: unknown
}

async function callTelegram(method: string, body: Record<string, unknown>): Promise<TelegramApiResponse> {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${getBotToken()}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({ ok: false }))) as TelegramApiResponse
    return data
}

/**
 * Envia uma mensagem de texto para um chat. parse_mode padrão HTML
 * (mais seguro que Markdown para texto livre).
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const data = await callTelegram("sendMessage", {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        })
        if (!data.ok) return { ok: false, error: data.description ?? "Falha no envio Telegram" }
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Erro inesperado no Telegram" }
    }
}
