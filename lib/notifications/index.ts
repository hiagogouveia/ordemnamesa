import "server-only"

import type { NotificationChannelType } from "@/lib/types"
import type { NotificationProvider } from "./types"
import { telegramProvider } from "./telegram/provider"

export type { NotificationProvider, SendResult } from "./types"

/**
 * Registry de providers de notificação. Fase 1: só Telegram implementado.
 * WhatsApp/email reservam o slot e lançam quando solicitados.
 */
const providers: Partial<Record<NotificationChannelType, NotificationProvider>> = {
    telegram: telegramProvider,
}

export function getProvider(channel: NotificationChannelType): NotificationProvider {
    const provider = providers[channel]
    if (!provider) {
        throw new Error(`Provider de notificação não implementado: ${channel}`)
    }
    return provider
}
