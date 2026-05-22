// Sincroniza plans.stripe_price_id_monthly/yearly a partir do Stripe (por lookup_key).
//
// Idempotente e agnóstico de ambiente: usa as credenciais do env carregado.
//   node --env-file=.env.nonprod scripts/sync-stripe-prices.mjs        (dry-run)
//   node --env-file=.env.nonprod scripts/sync-stripe-prices.mjs --apply
//   node --env-file=.env.prod    scripts/sync-stripe-prices.mjs --apply
//
// Pré-requisito: cada price no Stripe deve ter lookup_key = ordem_<code>_<cycle>
// (ex.: ordem_A_monthly, ordem_A_yearly). Em prod, criar os prices live primeiro.

import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")
const CODES = ["A", "B", "C", "D"]

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Faltam env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
}

const liveMode = STRIPE_SECRET_KEY.startsWith("sk_live_")
console.log(`Stripe em modo: ${liveMode ? "LIVE 🔴" : "TEST"} | apply=${APPLY}\n`)

async function stripePriceByLookup(lookupKey) {
    const url = new URL("https://api.stripe.com/v1/prices")
    url.searchParams.set("lookup_keys[]", lookupKey)
    url.searchParams.set("active", "true")
    const res = await fetch(url, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } })
    const json = await res.json()
    if (json.error) throw new Error(`Stripe ${lookupKey}: ${json.error.message}`)
    return json.data?.[0]?.id ?? null
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
})

let changed = 0
for (const code of CODES) {
    const monthly = await stripePriceByLookup(`ordem_${code}_monthly`)
    const yearly = await stripePriceByLookup(`ordem_${code}_yearly`)

    if (!monthly || !yearly) {
        console.warn(`⚠️  Plano ${code}: price ausente (monthly=${monthly}, yearly=${yearly}) — pulando`)
        continue
    }

    console.log(`Plano ${code}: monthly=${monthly} yearly=${yearly}`)
    if (APPLY) {
        const { error } = await supabase
            .from("plans")
            .update({ stripe_price_id_monthly: monthly, stripe_price_id_yearly: yearly })
            .eq("code", code)
        if (error) {
            console.error(`  ✗ erro ao atualizar ${code}: ${error.message}`)
            process.exitCode = 1
        } else {
            console.log(`  ✓ plans.${code} atualizado`)
            changed++
        }
    }
}

console.log(`\n${APPLY ? `Concluído. ${changed}/${CODES.length} planos atualizados.` : "Dry-run (use --apply para gravar)."}`)
