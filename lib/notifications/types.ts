import type { NotificationChannelType } from '@/lib/types'

export interface SendResult {
    ok: boolean
    error?: string
}

/**
 * Contrato desacoplado de envio. Cada canal (telegram, whatsapp, email)
 * implementa esta interface. Fase 1: só Telegram.
 */
export interface NotificationProvider {
    readonly channel: NotificationChannelType
    /**
     * @param externalId destino do canal (telegram chat id / phone / email)
     * @param message    texto da mensagem
     */
    send(externalId: string, message: string): Promise<SendResult>
}
