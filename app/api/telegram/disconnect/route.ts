import { NextResponse } from "next/server"
import { getAdminSupabase, requireOwnerOrManager } from "@/lib/notifications/telegram/server"
import { notificationLog } from "@/lib/notifications/log"

export const runtime = "nodejs"

/**
 * POST /api/telegram/disconnect
 * Body: { restaurant_id }
 *
 * Desativa o canal Telegram global do usuário logado. Owner/manager apenas.
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

        const { error } = await admin
            .from("notification_channels")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("channel_type", "telegram")
            .is("restaurant_id", null)

        if (error) {
            notificationLog.error({ op: "disconnect", channel: "telegram", user_id: userId, msg: error.message })
            return NextResponse.json({ error: "Falha ao desconectar." }, { status: 500 })
        }

        notificationLog.info({ op: "disconnect", channel: "telegram", user_id: userId, action: "disconnected" })
        return NextResponse.json({ ok: true })
    } catch (error: unknown) {
        console.error("[POST /api/telegram/disconnect] Erro inesperado:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
