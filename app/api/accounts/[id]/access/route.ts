import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canUseGlobal } from '@/lib/supabase/accounts'

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

// ── GET /api/accounts/[id]/access ──────────────────────────
// Retorna:
//   { units: [{id,name}], canUseGlobal: boolean, role: 'owner'|'manager'|null }
//
// Usado pela sidebar para decidir o que mostrar no switcher.
// A resolução é feita server-side com service_role; RLS não é
// contornada porque o endpoint re-valida o vínculo do auth.uid().
export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id: accountId } = await context.params

        const { user, error: authErr } = await getUser(request)
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado.' }, { status: 401 })
        }

        const admin = getAdminSupabase()

        // Vínculo direto com a account (owner/manager)?
        const { data: membership } = await admin
            .from('account_users')
            .select('role')
            .eq('account_id', accountId)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle<{ role: 'owner' | 'manager' }>()

        if (membership) {
            const { allowed, units } = await canUseGlobal(admin, accountId, user.id)
            return NextResponse.json({
                units,
                canUseGlobal: allowed,
                role: membership.role,
            })
        }

        // Staff: só vê as unidades onde tem vínculo ativo; sem global.
        const { data: staffRows, error: staffError } = await admin
            .from('restaurant_users')
            .select('restaurants!inner ( id, name, active, account_id )')
            .eq('user_id', user.id)
            .eq('active', true)
            .returns<Array<{ restaurants: { id: string; name: string; active: boolean; account_id: string } | null }>>()

        if (staffError) {
            return NextResponse.json({ error: staffError.message }, { status: 500 })
        }

        const units = (staffRows ?? [])
            .map((row) => row.restaurants)
            .filter((r): r is { id: string; name: string; active: boolean; account_id: string } => !!r && r.active && r.account_id === accountId)
            .map((r) => ({ id: r.id, name: r.name }))

        if (units.length === 0) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
        }

        return NextResponse.json({ units, canUseGlobal: false, role: null })
    } catch (error: unknown) {
        console.error('[GET /api/accounts/[id]/access] Erro:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
