import "server-only"
import Stripe from "stripe"

/**
 * Stripe server-side singleton.
 *
 * Regras:
 * - SOMENTE server-side (import "server-only" impede vazar a secret key para o client).
 * - apiVersion fixa para builds determinísticos (não seguir o default mutável do SDK).
 * - secret key resolvida de STRIPE_SECRET_KEY (test: sk_test_, prod: sk_live_).
 */

// Fixada na versão que a SDK (stripe@22.x) gera. Atualizar conscientemente.
const STRIPE_API_VERSION = "2026-04-22.dahlia" as const

let cached: Stripe | null = null

export function getStripe(): Stripe {
    if (cached) return cached

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
        throw new Error(
            "STRIPE_SECRET_KEY ausente. Configure no .env (sk_test_ em dev, sk_live_ em prod)."
        )
    }

    cached = new Stripe(secretKey, {
        apiVersion: STRIPE_API_VERSION,
        typescript: true,
        appInfo: { name: "ordem-na-mesa" },
    })
    return cached
}

/**
 * Webhook secret (whsec_). Validação separada porque só existe após criar o endpoint.
 */
export function getStripeWebhookSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) {
        throw new Error(
            "STRIPE_WEBHOOK_SECRET ausente. Obtenha via `stripe listen` (dev) ou no Dashboard (prod)."
        )
    }
    return secret
}

export { STRIPE_API_VERSION }
