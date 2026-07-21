import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

interface RestaurantUserJoin {
    restaurant_id: string
    role: 'owner' | 'manager' | 'staff'
    restaurants: {
        id: string
        name: string
        slug: string
        logo_path: string | null
        active: boolean
        account_id: string
        timezone: string | null
        accounts: { id: string; name: string; logo_path: string | null } | null
    } | null
}

const getAdminSupabase = () =>
    createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

// ── GET /api/my-restaurants ───────────────────────────────
// Retorna TODOS os restaurantes acessíveis ao usuário logado,
// independente de account. Usado no novo fluxo de entrada para
// decidir se redireciona direto ou mostra tela de seleção.
//
// Usa service_role porque a RLS de restaurants pode não cobrir
// staff que não está em account_users.
export async function GET() {
    const userClient = await createServerClient()
    const {
        data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const admin = getAdminSupabase()

    const { data, error } = await admin
        .from('restaurant_users')
        .select(`
            restaurant_id,
            role,
            restaurants!inner (
                id,
                name,
                slug,
                logo_path,
                active,
                account_id,
                timezone,
                accounts!inner ( id, name, logo_path )
            )
        `)
        .eq('user_id', user.id)
        .eq('active', true)
        .returns<RestaurantUserJoin[]>()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const restaurants = (data ?? [])
        .filter((row) => row.restaurants !== null && row.restaurants.active)
        .map((row) => ({
            id: row.restaurants!.id,
            name: row.restaurants!.name,
            slug: row.restaurants!.slug,
            logo_path: row.restaurants!.logo_path,
            account_id: row.restaurants!.account_id,
            account_name: row.restaurants!.accounts?.name ?? '',
            // Sprint 93 — logo do grupo viaja junto: é o fallback das filiais sem logo
            // própria e a única marca possível na Visão Global. Carona no join que já
            // existia, sem query nova.
            account_logo_path: row.restaurants!.accounts?.logo_path ?? null,
            timezone: row.restaurants!.timezone ?? 'America/Sao_Paulo',
            role: row.role,
        }))

    return NextResponse.json({ restaurants })
}
