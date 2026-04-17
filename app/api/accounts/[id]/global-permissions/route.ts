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

async function verifyOwner(admin: ReturnType<typeof getAdminSupabase>, accountId: string, userId: string) {
    const { data } = await admin
        .from('account_users')
        .select('role')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle<{ role: string }>()

    return data?.role === 'owner'
}

// ── GET /api/accounts/[id]/global-permissions ─────────────
// Retorna lista de managers da account com campo can_view_global.
// Apenas owner pode acessar.
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

        if (!(await verifyOwner(admin, accountId, user.id))) {
            return NextResponse.json({ error: 'Apenas proprietários podem gerenciar permissões.' }, { status: 403 })
        }

        // Buscar managers ativos com dados do user
        const { data: managers, error } = await admin
            .from('account_users')
            .select('id, user_id, role, can_view_global')
            .eq('account_id', accountId)
            .eq('role', 'manager')
            .eq('active', true)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Buscar dados de cada user (nome e email)
        const userIds = (managers ?? []).map((m: any) => m.user_id)

        let usersMap: Record<string, { name: string; email: string }> = {}
        if (userIds.length > 0) {
            const { data: { users }, error: usersError } = await admin.auth.admin.listUsers()
            if (!usersError && users) {
                for (const u of users) {
                    if (userIds.includes(u.id)) {
                        usersMap[u.id] = {
                            name: (u.user_metadata?.name as string) || (u.user_metadata?.full_name as string) || '',
                            email: u.email || '',
                        }
                    }
                }
            }
        }

        const result = (managers ?? []).map((m: any) => ({
            id: m.id,
            user_id: m.user_id,
            name: usersMap[m.user_id]?.name || '',
            email: usersMap[m.user_id]?.email || '',
            can_view_global: m.can_view_global,
        }))

        return NextResponse.json({ managers: result })
    } catch (error: unknown) {
        console.error('[GET /api/accounts/[id]/global-permissions] Erro:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}

// ── PATCH /api/accounts/[id]/global-permissions ───────────
// Atualiza can_view_global de um manager específico.
// Apenas owner pode alterar.
export async function PATCH(
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

        if (!(await verifyOwner(admin, accountId, user.id))) {
            return NextResponse.json({ error: 'Apenas proprietários podem gerenciar permissões.' }, { status: 403 })
        }

        const body = await request.json()
        const { account_user_id, can_view_global } = body as {
            account_user_id: string
            can_view_global: boolean
        }

        if (!account_user_id || typeof can_view_global !== 'boolean') {
            return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
        }

        // Validar que o target é manager da mesma account
        const { data: target } = await admin
            .from('account_users')
            .select('id, role, account_id')
            .eq('id', account_user_id)
            .maybeSingle()

        if (!target || target.account_id !== accountId) {
            return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })
        }

        if (target.role !== 'manager') {
            return NextResponse.json({ error: 'Apenas permissões de gerentes podem ser alteradas.' }, { status: 400 })
        }

        const { data: updated, error } = await admin
            .from('account_users')
            .update({ can_view_global })
            .eq('id', account_user_id)
            .select('id, can_view_global')
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(updated)
    } catch (error: unknown) {
        console.error('[PATCH /api/accounts/[id]/global-permissions] Erro:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
