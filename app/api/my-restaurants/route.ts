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
        logo_url: string | null
        active: boolean
        account_id: string
        accounts: { id: string; name: string } | null
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
                logo_url,
                active,
                account_id,
                accounts!inner ( id, name )
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
            logo_url: row.restaurants!.logo_url,
            account_id: row.restaurants!.account_id,
            account_name: row.restaurants!.accounts?.name ?? '',
            role: row.role,
        }))

    return NextResponse.json({ restaurants, userId: user.id })
}
