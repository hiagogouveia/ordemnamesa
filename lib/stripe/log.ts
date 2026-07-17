import "server-only"

/**
 * Log estruturado (JSON, uma linha) para os fluxos Stripe.
 * Sem Sentry/Datadog — apenas console com correlação mínima para
 * grep em produção (docker logs). Campos sensíveis NUNCA são logados
 * (sem secret/whsec/token/card).
 */
type StripeOp = "checkout" | "portal" | "webhook" | "billing"

interface StripeLogContext {
    op: StripeOp
    event?: string // tipo do evento (webhook) ou ação
    account_id?: string | null
    stripe_customer_id?: string | null
    stripe_subscription_id?: string | null
    event_id?: string | null // Stripe event.id
    status?: string
    msg?: string
}

function emit(level: "info" | "warn" | "error", ctx: StripeLogContext) {
    const line = JSON.stringify({ scope: "stripe", level, ts: new Date().toISOString(), ...ctx })
    if (level === "error") console.error(line)
    else if (level === "warn") console.warn(line)
    else console.log(line)
}

export const stripeLog = {
    info: (ctx: StripeLogContext) => emit("info", ctx),
    warn: (ctx: StripeLogContext) => emit("warn", ctx),
    error: (ctx: StripeLogContext) => emit("error", ctx),
}
