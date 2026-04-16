import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

interface AccountRow {
    id: string
    name: string
}

interface AccountUserJoin {
    account_id: string
    accounts: AccountRow | null
}

interface RestaurantJoin {
    account_id: string
    accounts: AccountRow | null
}

const getAdminSupabase = () =>
    createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

// ── GET /api/accounts ─────────────────────────────────────
// Retorna as accounts acessíveis ao usuário logado.
//
// Fonte:
//   1. account_users (owners/managers da account)
//   2. restaurants via restaurant_users (staff cuja única ponte
//      para a account é o vínculo com um restaurant dela)
//
// A resolução usa service_role porque a RLS de `accounts` só
// enxerga membros diretos (account_users). Staff precisa ver
// o nome da account da qual faz parte indiretamente.
export async function GET() {
    const userClient = await createServerClient()
    const {
        data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const admin = getAdminSupabase()

    // Vínculos diretos
    const { data: direct, error: directError } = await admin
        .from('account_users')
        .select('account_id, accounts ( id, name )')
        .eq('user_id', user.id)
        .eq('active', true)
        .returns<AccountUserJoin[]>()

    if (directError) {
        return NextResponse.json({ error: directError.message }, { status: 500 })
    }

    // Vínculos indiretos via restaurant_users → restaurants
    const { data: indirect, error: indirectError } = await admin
        .from('restaurant_users')
        .select('restaurants!inner ( account_id, accounts:accounts!inner ( id, name ) )')
        .eq('user_id', user.id)
        .eq('active', true)
        .returns<Array<{ restaurants: RestaurantJoin | null }>>()

    if (indirectError) {
        return NextResponse.json({ error: indirectError.message }, { status: 500 })
    }

    const seen = new Set<string>()
    const accounts: AccountRow[] = []

    for (const row of direct ?? []) {
        if (row.accounts && !seen.has(row.accounts.id)) {
            seen.add(row.accounts.id)
            accounts.push(row.accounts)
        }
    }
    for (const row of indirect ?? []) {
        const acc = row.restaurants?.accounts ?? null
        if (acc && !seen.has(acc.id)) {
            seen.add(acc.id)
            accounts.push(acc)
        }
    }

    return NextResponse.json({ accounts })
}
