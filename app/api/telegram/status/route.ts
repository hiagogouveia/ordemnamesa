import { NextResponse } from "next/server"
import { getAdminSupabase, requireOwnerOrManager } from "@/lib/notifications/telegram/server"

export const runtime = "nodejs"

/** Mascara o chat id para não expor o valor completo ao frontend. */
function maskExternalId(value: string): string {
    if (value.length <= 4) return "••••"
    return `••••${value.slice(-4)}`
}

/**
 * GET /api/telegram/status?restaurant_id=...
 *
 * Status do canal Telegram global do usuário logado. Owner/manager apenas.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const restaurant_id = searchParams.get("restaurant_id")

        const admin = getAdminSupabase()
        const check = await requireOwnerOrManager(request, restaurant_id, admin)
        if ("error" in check) {
            return NextResponse.json({ error: check.error }, { status: check.status })
        }
        const userId = check.auth.user.id

        const { data: channel } = await admin
            .from("notification_channels")
            .select("external_id, is_active, updated_at")
            .eq("user_id", userId)
            .eq("channel_type", "telegram")
            .is("restaurant_id", null)
            .eq("is_active", true)
            .maybeSingle()

        if (!channel) {
            return NextResponse.json({ connected: false })
        }

        return NextResponse.json({
            connected: true,
            external_id_masked: maskExternalId(channel.external_id),
            connected_at: channel.updated_at,
        })
    } catch (error: unknown) {
        console.error("[GET /api/telegram/status] Erro inesperado:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
