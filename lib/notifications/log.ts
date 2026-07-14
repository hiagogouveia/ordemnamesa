import "server-only"

/**
 * Log estruturado (JSON, uma linha) para os fluxos de notificação.
 * Espelha lib/stripe/log.ts. Campos sensíveis NUNCA são logados
 * (sem bot token, sem secret, sem chat id completo).
 */
// s90: verbos do ciclo de vida da notificação in-app (emit → materialize → click →
// navigate). Correlacionados por `event_id`, que é o correlation id de ponta a ponta.
type NotificationOp =
    | "webhook" | "send" | "link" | "status" | "disconnect"
    | "emit" | "materialize" | "deliver" | "click" | "navigate"

interface NotificationLogContext {
    op: NotificationOp
    channel?: string
    action?: string
    user_id?: string | null
    restaurant_id?: string | null
    status?: string
    msg?: string
}

function emit(level: "info" | "warn" | "error", ctx: NotificationLogContext) {
    const line = JSON.stringify({ scope: "notifications", level, ts: new Date().toISOString(), ...ctx })
    if (level === "error") console.error(line)
    else if (level === "warn") console.warn(line)
    else console.log(line)
}

export const notificationLog = {
    info: (ctx: NotificationLogContext) => emit("info", ctx),
    warn: (ctx: NotificationLogContext) => emit("warn", ctx),
    error: (ctx: NotificationLogContext) => emit("error", ctx),
}
