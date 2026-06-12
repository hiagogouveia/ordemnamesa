import "server-only"

import type { NotificationProvider, SendResult } from "../types"
import { sendTelegramMessage } from "./client"

export const telegramProvider: NotificationProvider = {
    channel: "telegram",
    async send(externalId: string, message: string): Promise<SendResult> {
        return sendTelegramMessage(externalId, message)
    },
}
