import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

async function getUser(request: Request) {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) return { user: null, error: 'Token ausente' }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error } = await getAdminSupabase().auth.getUser(token)
    return { user: error ? null : user, error: error?.message }
}

interface AccountUserRow {
    role: 'owner' | 'manager'
}

interface UnitRow {
    id: string
    name: string
    slug: string
    cnpj: string | null
    is_primary: boolean
    active: boolean
    account_id: string
    created_at: string
}

function digitsOnly(value: string): string {
    return value.replace(/\D/g, '')
}

function generateSlug(name: string): string {
    const base = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    const suffix = Math.random().toString(36).slice(2, 6)
    return `${base}-${suffix}`
}

// ── GET /api/units?account_id=... ──────────────────────────
// Lista unidades ativas da account. Qualquer membro ativo da
// account (owner ou manager) pode ver.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const account_id = searchParams.get('account_id')

        if (!account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório.' }, { status: 400 })
        }

        const { user, error: authErr } = await getUser(request)
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado.' }, { status: 401 })
        }

        const admin = getAdminSupabase()

        const { data: membership } = await admin
            .from('account_users')
            .select('role')
            .eq('account_id', account_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle<AccountUserRow>()

        if (!membership) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
        }

        const { data, error } = await admin
            .from('restaurants')
            .select('id, name, slug, cnpj, is_primary, active, account_id, created_at')
            .eq('account_id', account_id)
            .eq('active', true)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true })
            .returns<UnitRow[]>()

        if (error) {
            console.error('[GET /api/units]', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ units: data ?? [] })
    } catch (error: unknown) {
        console.error('[GET /api/units] Erro inesperado:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}

// ── POST /api/units ────────────────────────────────────────
// Cria unidade vazia na account. Apenas owners da account
// podem criar. Todos os owners da account viram owners da
// nova unidade via restaurant_users.
export async function POST(request: Request) {
    try {
        const { user, error: authErr } = await getUser(request)
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado.' }, { status: 401 })
        }

        const body = await request.json().catch(() => null) as
            | { account_id?: string; name?: string; cnpj?: string | null }
            | null

        if (!body) {
            return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
        }

        const { account_id, name, cnpj } = body

        if (!account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório.' }, { status: 400 })
        }
        if (!name?.trim()) {
            return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
        }

        const cnpjDigits = cnpj ? digitsOnly(cnpj) : null
        if (cnpjDigits && cnpjDigits.length !== 14) {
            return NextResponse.json({ error: 'CNPJ inválido. Informe 14 dígitos.' }, { status: 400 })
        }

        const admin = getAdminSupabase()

        // Apenas owners da account podem criar unidades
        const { data: membership } = await admin
            .from('account_users')
            .select('role')
            .eq('account_id', account_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle<AccountUserRow>()

        if (!membership || membership.role !== 'owner') {
            return NextResponse.json({ error: 'Apenas owners podem criar unidades.' }, { status: 403 })
        }

        // Buscar todos os owners ativos da account para replicar em restaurant_users
        const { data: ownerRows, error: ownersError } = await admin
            .from('account_users')
            .select('user_id')
            .eq('account_id', account_id)
            .eq('role', 'owner')
            .eq('active', true)
            .returns<Array<{ user_id: string }>>()

        if (ownersError) {
            console.error('[POST /api/units] ownersError', ownersError)
            return NextResponse.json({ error: ownersError.message }, { status: 500 })
        }

        const slug = generateSlug(name.trim())

        const { data: restaurant, error: insertError } = await admin
            .from('restaurants')
            .insert({
                name: name.trim(),
                slug,
                owner_id: user.id,
                cnpj: cnpjDigits,
                account_id,
                is_primary: false,
                active: true,
            })
            .select('id, name, slug, cnpj, is_primary, active, account_id, created_at')
            .single<UnitRow>()

        if (insertError || !restaurant) {
            const msg = (insertError?.message ?? '').toLowerCase()
            if (msg.includes('cnpj')) {
                return NextResponse.json({ error: 'CNPJ já cadastrado.' }, { status: 409 })
            }
            console.error('[POST /api/units] insertError', insertError)
            return NextResponse.json({ error: insertError?.message ?? 'Falha ao criar unidade.' }, { status: 500 })
        }

        // Replicar owners em restaurant_users (idempotente via upsert)
        const memberships = (ownerRows ?? []).map((row) => ({
            restaurant_id: restaurant.id,
            user_id: row.user_id,
            role: 'owner' as const,
            active: true,
        }))

        if (memberships.length > 0) {
            const { error: ruError } = await admin
                .from('restaurant_users')
                .upsert(memberships, { onConflict: 'restaurant_id,user_id' })
            if (ruError) {
                // Compensating: remover a unidade criada para evitar estado inconsistente
                await admin.from('restaurants').delete().eq('id', restaurant.id)
                console.error('[POST /api/units] ruError', ruError)
                return NextResponse.json({ error: ruError.message }, { status: 500 })
            }
        }

        return NextResponse.json({ unit: restaurant }, { status: 201 })
    } catch (error: unknown) {
        console.error('[POST /api/units] Erro inesperado:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
