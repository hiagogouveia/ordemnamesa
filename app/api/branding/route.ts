import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BRAND_BUCKET, isPathOwnedByAccount } from '@/lib/branding/storage'

/**
 * Sprint 93 — Persistência da referência da logo (white-label parcial).
 *
 * Os BYTES não passam por aqui: o browser sobe direto ao Storage, protegido pela RLS
 * do bucket `brand` (mesmo padrão de `uploadEvidencePhoto`). Esta rota só grava o
 * PATH na tabela — e é onde a autorização de verdade acontece.
 *
 * Regra inegociável, herdada de lib/hooks/use-tenant-from-url.ts:
 *
 *              O PATH VEM DO CLIENTE, LOGO É UM PEDIDO, NUNCA UMA AUTORIDADE.
 *
 * Mesmo que a RLS do Storage já impeça gravar fora do próprio account_id, revalidamos
 * aqui que o path pertence à account do usuário. Sem isso, um owner da conta A poderia
 * apontar `restaurants.logo_path` da SUA unidade para um objeto da conta B — a escrita
 * seria legítima na tabela, e o vazamento aconteceria na leitura.
 */

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

async function assertOwner(
    admin: ReturnType<typeof getAdminSupabase>,
    accountId: string,
    userId: string
): Promise<{ ok: true } | { ok: false; code: 'not_account_member' | 'forbidden' }> {
    const { data } = await admin
        .from('account_users')
        .select('role')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle<AccountUserRow>()
    if (!data) return { ok: false, code: 'not_account_member' }
    if (data.role !== 'owner') return { ok: false, code: 'forbidden' }
    return { ok: true }
}

type Scope = 'restaurant' | 'account'

/**
 * Resolve a account dona do alvo A PARTIR DO BANCO — nunca a partir de um account_id
 * enviado pelo cliente. É isso que impede apontar a logo de uma unidade de outro grupo.
 */
async function resolveTargetAccount(
    admin: ReturnType<typeof getAdminSupabase>,
    scope: Scope,
    targetId: string
): Promise<{ accountId: string; currentPath: string | null } | null> {
    if (scope === 'account') {
        const { data } = await admin
            .from('accounts')
            .select('id, logo_path')
            .eq('id', targetId)
            .maybeSingle<{ id: string; logo_path: string | null }>()
        return data ? { accountId: data.id, currentPath: data.logo_path } : null
    }

    const { data } = await admin
        .from('restaurants')
        .select('account_id, logo_path')
        .eq('id', targetId)
        .maybeSingle<{ account_id: string | null; logo_path: string | null }>()
    return data?.account_id ? { accountId: data.account_id, currentPath: data.logo_path } : null
}

/** Remove o objeto anterior. Best-effort: órfão no storage não justifica falhar a request. */
async function removeAsset(
    admin: ReturnType<typeof getAdminSupabase>,
    path: string | null | undefined
): Promise<void> {
    if (!path) return
    try {
        await admin.storage.from(BRAND_BUCKET).remove([path])
    } catch (err) {
        console.warn('[/api/branding] falha ao remover asset antigo', path, err)
    }
}

function parseScope(value: unknown): Scope | null {
    return value === 'restaurant' || value === 'account' ? value : null
}

async function authorize(request: Request, scope: Scope, targetId: string) {
    const { user } = await getUser(request)
    if (!user) {
        return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
    }

    const admin = getAdminSupabase()
    const target = await resolveTargetAccount(admin, scope, targetId)
    if (!target) {
        return { error: NextResponse.json({ error: 'Alvo não encontrado.' }, { status: 404 }) }
    }

    const ownerCheck = await assertOwner(admin, target.accountId, user.id)
    if (!ownerCheck.ok) {
        const msg = ownerCheck.code === 'not_account_member'
            ? 'Você não pertence a esta conta.'
            : 'Apenas proprietários podem alterar a marca.'
        return { error: NextResponse.json({ error: msg, code: ownerCheck.code }, { status: 403 }) }
    }

    return { admin, target }
}

// ── PATCH /api/branding ─────────────────────────────────────
// Body: { scope: 'restaurant' | 'account', target_id: string, storage_path: string }
export async function PATCH(request: Request) {
    try {
        const body = await request.json() as {
            scope?: unknown
            target_id?: unknown
            storage_path?: unknown
        }

        const scope = parseScope(body.scope)
        const targetId = typeof body.target_id === 'string' ? body.target_id : null
        const storagePath = typeof body.storage_path === 'string' ? body.storage_path : null

        if (!scope || !targetId || !storagePath) {
            return NextResponse.json(
                { error: 'Parâmetros inválidos: scope, target_id e storage_path são obrigatórios.' },
                { status: 400 }
            )
        }

        const auth = await authorize(request, scope, targetId)
        if ('error' in auth) return auth.error
        const { admin, target } = auth

        // A revalidação que justifica esta rota existir (ver cabeçalho do arquivo).
        if (!isPathOwnedByAccount(storagePath, target.accountId)) {
            return NextResponse.json(
                { error: 'Caminho de arquivo não pertence a esta conta.', code: 'path_forbidden' },
                { status: 403 }
            )
        }

        const table = scope === 'account' ? 'accounts' : 'restaurants'
        const { error } = await admin
            .from(table)
            .update({ logo_path: storagePath })
            .eq('id', targetId)

        if (error) {
            console.error('[PATCH /api/branding] updateError', error)
            return NextResponse.json({ error: 'Falha ao salvar a logo.' }, { status: 500 })
        }

        // Só depois de persistir. Se o path novo for igual ao antigo (reenvio da mesma
        // imagem → mesmo hash), não apagar — removeria o arquivo recém-confirmado.
        if (target.currentPath && target.currentPath !== storagePath) {
            await removeAsset(admin, target.currentPath)
        }

        return NextResponse.json({ logo_path: storagePath })
    } catch (error) {
        console.error('[PATCH /api/branding] Erro inesperado:', error)
        return NextResponse.json({ error: 'Erro inesperado.' }, { status: 500 })
    }
}

// ── DELETE /api/branding?scope=...&target_id=... ────────────
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const scope = parseScope(searchParams.get('scope'))
        const targetId = searchParams.get('target_id')

        if (!scope || !targetId) {
            return NextResponse.json(
                { error: 'Parâmetros inválidos: scope e target_id são obrigatórios.' },
                { status: 400 }
            )
        }

        const auth = await authorize(request, scope, targetId)
        if ('error' in auth) return auth.error
        const { admin, target } = auth

        const table = scope === 'account' ? 'accounts' : 'restaurants'
        const { error } = await admin
            .from(table)
            .update({ logo_path: null })
            .eq('id', targetId)

        if (error) {
            console.error('[DELETE /api/branding] updateError', error)
            return NextResponse.json({ error: 'Falha ao remover a logo.' }, { status: 500 })
        }

        await removeAsset(admin, target.currentPath)

        return NextResponse.json({ logo_path: null })
    } catch (error) {
        console.error('[DELETE /api/branding] Erro inesperado:', error)
        return NextResponse.json({ error: 'Erro inesperado.' }, { status: 500 })
    }
}
