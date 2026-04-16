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

async function assertOwner(
    admin: ReturnType<typeof getAdminSupabase>,
    accountId: string,
    userId: string
) {
    const { data } = await admin
        .from('account_users')
        .select('role')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle<AccountUserRow>()
    return !!data && data.role === 'owner'
}

async function loadUnit(
    admin: ReturnType<typeof getAdminSupabase>,
    unitId: string
): Promise<UnitRow | null> {
    const { data } = await admin
        .from('restaurants')
        .select('id, name, slug, cnpj, is_primary, active, account_id, created_at')
        .eq('id', unitId)
        .maybeSingle<UnitRow>()
    return data
}

// ── PATCH /api/units/[id] ───────────────────────────────────
// Body: { account_id: string; name?: string; set_primary?: boolean }
// Apenas owners da account podem editar.
export async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params
        const { user, error: authErr } = await getUser(request)
        if (!user) {
            return NextResponse.json({ error: authErr || 'Não autorizado.' }, { status: 401 })
        }

        const body = await request.json().catch(() => null) as
            | { account_id?: string; name?: string; set_primary?: boolean }
            | null

        if (!body) {
            return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
        }

        const { account_id, name, set_primary } = body

        if (!account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório.' }, { status: 400 })
        }

        const admin = getAdminSupabase()

        if (!(await assertOwner(admin, account_id, user.id))) {
            return NextResponse.json({ error: 'Apenas owners podem editar unidades.' }, { status: 403 })
        }

        const unit = await loadUnit(admin, id)
        if (!unit || unit.account_id !== account_id) {
            return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 })
        }

        // Promoção a principal: só é válida em unidade ativa
        if (set_primary === true) {
            if (!unit.active) {
                return NextResponse.json({ error: 'Unidade inativa não pode ser principal.' }, { status: 400 })
            }
            const { error: clearError } = await admin
                .from('restaurants')
                .update({ is_primary: false })
                .eq('account_id', account_id)
                .neq('id', id)
            if (clearError) {
                console.error('[PATCH /api/units/[id]] clearError', clearError)
                return NextResponse.json({ error: clearError.message }, { status: 500 })
            }
        }

        const updates: Record<string, string | boolean> = {}
        if (typeof name === 'string' && name.trim().length > 0) {
            updates.name = name.trim()
        }
        if (set_primary === true) {
            updates.is_primary = true
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ unit })
        }

        const { data: updated, error } = await admin
            .from('restaurants')
            .update(updates)
            .eq('id', id)
            .eq('account_id', account_id)
            .select('id, name, slug, cnpj, is_primary, active, account_id, created_at')
            .single<UnitRow>()

        if (error || !updated) {
            console.error('[PATCH /api/units/[id]] updateError', error)
            return NextResponse.json({ error: error?.message ?? 'Falha ao atualizar.' }, { status: 500 })
        }

        return NextResponse.json({ unit: updated })
    } catch (error: unknown) {
        console.error('[PATCH /api/units/[id]] Erro inesperado:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}

// ── DELETE /api/units/[id]?account_id=... ──────────────────
// Soft delete (active=false, deleted_at=now()).
// Regras de bloqueio:
//  1. Unidade é principal → bloqueia
//  2. É a única unidade ativa da account → bloqueia
//  3. Possui checklists ativos → bloqueia
//  4. Possui vínculos em restaurant_users não-owners (ex: staff, manager ativo) → bloqueia
export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params
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

        if (!(await assertOwner(admin, account_id, user.id))) {
            return NextResponse.json({ error: 'Apenas owners podem excluir unidades.' }, { status: 403 })
        }

        const unit = await loadUnit(admin, id)
        if (!unit || unit.account_id !== account_id) {
            return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 })
        }

        if (!unit.active) {
            return NextResponse.json({ error: 'Unidade já está inativa.' }, { status: 400 })
        }

        if (unit.is_primary) {
            return NextResponse.json(
                { error: 'Não é possível excluir a unidade principal. Defina outra como principal antes.' },
                { status: 409 }
            )
        }

        const { count: activeCount, error: countError } = await admin
            .from('restaurants')
            .select('id', { count: 'exact', head: true })
            .eq('account_id', account_id)
            .eq('active', true)

        if (countError) {
            console.error('[DELETE /api/units/[id]] countError', countError)
            return NextResponse.json({ error: countError.message }, { status: 500 })
        }

        if ((activeCount ?? 0) <= 1) {
            return NextResponse.json(
                { error: 'Não é possível excluir a única unidade ativa da conta.' },
                { status: 409 }
            )
        }

        const { count: checklistCount, error: checklistError } = await admin
            .from('checklists')
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', id)
            .eq('active', true)

        if (checklistError) {
            console.error('[DELETE /api/units/[id]] checklistError', checklistError)
            return NextResponse.json({ error: checklistError.message }, { status: 500 })
        }

        if ((checklistCount ?? 0) > 0) {
            return NextResponse.json(
                { error: 'Unidade possui rotinas ativas. Arquive-as antes de excluir.' },
                { status: 409 }
            )
        }

        const { count: nonOwnerCount, error: teamError } = await admin
            .from('restaurant_users')
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', id)
            .eq('active', true)
            .neq('role', 'owner')

        if (teamError) {
            console.error('[DELETE /api/units/[id]] teamError', teamError)
            return NextResponse.json({ error: teamError.message }, { status: 500 })
        }

        if ((nonOwnerCount ?? 0) > 0) {
            return NextResponse.json(
                { error: 'Unidade possui equipe ativa (managers/staff). Remova-os antes de excluir.' },
                { status: 409 }
            )
        }

        const { error: softError } = await admin
            .from('restaurants')
            .update({ active: false, deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('account_id', account_id)

        if (softError) {
            console.error('[DELETE /api/units/[id]] softError', softError)
            return NextResponse.json({ error: softError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error('[DELETE /api/units/[id]] Erro inesperado:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
