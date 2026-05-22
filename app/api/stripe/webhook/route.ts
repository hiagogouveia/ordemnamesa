import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/server"
import { supabaseAdmin } from "@/lib/admin-leads-control-hub/supabase-admin"
import { handleStripeEvent } from "@/lib/stripe/webhook-handlers"
import { stripeLog } from "@/lib/stripe/log"

// Precisa do corpo cru para validar a assinatura — sem cache, sempre dinâmico.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
    const signature = req.headers.get("stripe-signature")
    if (!signature) {
        return NextResponse.json({ error: "missing signature" }, { status: 400 })
    }

    // 1. Validação de assinatura sobre o corpo CRU.
    let event: Stripe.Event
    try {
        const rawBody = await req.text()
        event = getStripe().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret())
    } catch (err) {
        const msg = err instanceof Error ? err.message : "invalid payload"
        stripeLog.error({ op: "webhook", event: "signature", msg })
        return NextResponse.json({ error: "invalid signature" }, { status: 400 })
    }

    // 2. Idempotência: se já processamos esse event.id, retorna 200 sem reprocessar.
    const { error: insertErr } = await supabaseAdmin
        .from("stripe_events")
        .insert({ id: event.id, type: event.type })

    if (insertErr) {
        // 23505 = unique_violation → reentrega de evento já processado.
        if ((insertErr as { code?: string }).code === "23505") {
            stripeLog.info({ op: "webhook", event: event.type, event_id: event.id, msg: "duplicado (idempotente)" })
            return NextResponse.json({ received: true, duplicate: true })
        }
        stripeLog.error({ op: "webhook", event: event.type, event_id: event.id, msg: `idempotency store: ${insertErr.message}` })
        // Não conseguimos garantir idempotência → 500 para o Stripe reentregar.
        return NextResponse.json({ error: "idempotency store failed" }, { status: 500 })
    }

    // 3. Processamento. Erro → 500 para o Stripe reentregar (retry-safe).
    try {
        await handleStripeEvent(event)
    } catch (err) {
        const msg = err instanceof Error ? err.message : "handler error"
        stripeLog.error({ op: "webhook", event: event.type, event_id: event.id, msg })
        // Remove o registro para permitir reprocessamento na reentrega.
        await supabaseAdmin.from("stripe_events").delete().eq("id", event.id)
        return NextResponse.json({ error: "processing failed" }, { status: 500 })
    }

    stripeLog.info({ op: "webhook", event: event.type, event_id: event.id, msg: "processado" })
    return NextResponse.json({ received: true })
}
