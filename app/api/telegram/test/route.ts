import { NextResponse } from "next/server"
import { getAdminSupabase, requireOwnerOrManager } from "@/lib/notifications/telegram/server"
import { getProvider } from "@/lib/notifications"
import { notificationLog } from "@/lib/notifications/log"

export const runtime = "nodejs"

const TEST_MESSAGE =
    "🚀 <b>Teste de integração</b>\n\nSeu Telegram está conectado ao Ordem na Mesa com sucesso."

/**
 * POST /api/telegram/test
 * Body: { restaurant_id }
 *
 * Envia uma mensagem de teste ao canal Telegram do usuário. Owner/manager apenas.
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

        const { data: channel } = await admin
            .from("notification_channels")
            .select("external_id")
            .eq("user_id", userId)
            .eq("channel_type", "telegram")
            .is("restaurant_id", null)
            .eq("is_active", true)
            .maybeSingle()

        if (!channel) {
            return NextResponse.json({ error: "Telegram não conectado." }, { status: 400 })
        }

        const result = await getProvider("telegram").send(channel.external_id, TEST_MESSAGE)
        if (!result.ok) {
            notificationLog.error({ op: "send", channel: "telegram", user_id: userId, action: "test", msg: result.error })
            return NextResponse.json({ error: result.error ?? "Falha ao enviar." }, { status: 502 })
        }

        notificationLog.info({ op: "send", channel: "telegram", user_id: userId, action: "test", status: "sent" })
        return NextResponse.json({ ok: true })
    } catch (error: unknown) {
        console.error("[POST /api/telegram/test] Erro inesperado:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
