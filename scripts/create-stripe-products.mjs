// Cria produtos + prices (mensal e anual) no Stripe a partir da tabela `plans`.
// Idempotente: usa lookup_key (ordem_<code>_<cycle>); se já existir, não duplica.
// Anual = price_yearly_cents * 12 (decisão de negócio: yearly_cents é o mensal-equivalente).
//
//   node --env-file=.env.nonprod scripts/create-stripe-products.mjs           (dry-run)
//   node --env-file=.env.prod    scripts/create-stripe-products.mjs --apply   (cria no LIVE)
//
// Depois rode scripts/sync-stripe-prices.mjs --apply para vincular os IDs no banco.

import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Faltam env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
}
console.log(`Stripe: ${STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE 🔴" : "TEST"} | apply=${APPLY}\n`)

async function stripe(path, params) {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) body.set(k, String(v))
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
        method: params ? "POST" : "GET",
        headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params ? body : undefined,
    })
    const json = await res.json()
    if (json.error) throw new Error(`${path}: ${json.error.message}`)
    return json
}

async function priceExists(lookupKey) {
    const res = await stripe(`/prices?active=true&lookup_keys[]=${encodeURIComponent(lookupKey)}`)
    return res.data?.[0]?.id ?? null
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
})

const { data: plans, error } = await supabase
    .from("plans")
    .select("code, name, price_monthly_cents, price_yearly_cents")
    .eq("active", true)
    .order("code")
if (error) { console.error(error.message); process.exit(1) }

for (const p of plans) {
    console.log(`\nPlano ${p.code} — ${p.name}`)
    const cycles = [
        { cycle: "monthly", interval: "month", amount: p.price_monthly_cents },
        { cycle: "yearly", interval: "year", amount: p.price_yearly_cents * 12 },
    ]

    // produto compartilhado pelos dois ciclos
    let productId = null
    for (const c of cycles) {
        const lookupKey = `ordem_${p.code}_${c.cycle}`
        const existing = await priceExists(lookupKey)
        if (existing) {
            console.log(`  = ${c.cycle}: já existe (${existing})`)
            continue
        }
        if (!APPLY) {
            console.log(`  + ${c.cycle}: CRIARIA ${c.amount} brl/${c.interval} (lookup ${lookupKey})`)
            continue
        }
        if (!productId) {
            const prod = await stripe("/products", { name: p.name, "metadata[plan_code]": p.code })
            productId = prod.id
        }
        const price = await stripe("/prices", {
            product: productId,
            currency: "brl",
            unit_amount: c.amount,
            "recurring[interval]": c.interval,
            lookup_key: lookupKey,
            transfer_lookup_key: "true",
            "metadata[plan_code]": p.code,
            "metadata[cycle]": c.cycle,
            nickname: `${p.name} ${c.cycle === "yearly" ? "Anual" : "Mensal"}`,
        })
        console.log(`  ✓ ${c.cycle}: criado ${price.id}`)
    }
}
console.log(`\n${APPLY ? "Concluído." : "Dry-run (use --apply)."} Depois rode sync-stripe-prices.mjs --apply.`)
