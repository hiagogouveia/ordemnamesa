import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listUserAccountIds } from '@/lib/supabase/accounts'
import {
    getAccountBilling,
    canAccessApp,
    canCreateResources,
    canExecuteTasks,
} from '@/lib/billing/subscription-access'

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

/**
 * GET /api/billing/status
 *
 * Resolve account do user logado via listUserAccountIds — nunca confia em
 * account_id vindo do client. Se o user tem múltiplas accounts, aceita
 * ?account_id=X OU header x-account-id, MAS valida que está na lista.
 *
 * Retorna:
 *  - subscription, plan (fonte de verdade do estado de billing)
 *  - access: flags derivadas (can_access_app, can_create_resources, can_execute_tasks)
 *  - days_until_expiration, is_expired
 *
 * Sem UI de banner nesta fase — dados já expostos para o frontend consumir.
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
        }
        const token = authHeader.replace('Bearer ', '')
        const admin = getAdminSupabase()

        const { data: { user }, error: userError } = await admin.auth.getUser(token)
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
        }

        const accountIds = await listUserAccountIds(admin, user.id)
        if (accountIds.length === 0) {
            return NextResponse.json(
                { error: 'Usuário não pertence a nenhuma account.' },
                { status: 404 }
            )
        }

        let targetAccountId: string
        if (accountIds.length === 1) {
            targetAccountId = accountIds[0]
        } else {
            const { searchParams } = new URL(request.url)
            const requested =
                searchParams.get('account_id') ??
                request.headers.get('x-account-id') ??
                null

            if (!requested) {
                return NextResponse.json(
                    {
                        error: 'Usuário possui múltiplas accounts. Informe account_id via ?account_id=... ou header x-account-id.',
                    },
                    { status: 400 }
                )
            }
            if (!accountIds.includes(requested)) {
                return NextResponse.json(
                    { error: 'Account não pertence ao usuário.' },
                    { status: 403 }
                )
            }
            targetAccountId = requested
        }

        const billing = await getAccountBilling(admin, targetAccountId)
        if (!billing) {
            // Estado anômalo — backfill deveria garantir que não acontece
            return NextResponse.json(
                {
                    error: 'Account sem subscription. Contate o suporte.',
                    reason: 'no_subscription',
                },
                { status: 402 }
            )
        }

        return NextResponse.json({
            account_id: targetAccountId,
            subscription: billing.subscription,
            plan: billing.plan,
            days_until_expiration: billing.days_until_expiration,
            is_expired: billing.is_expired,
            access: {
                can_access_app: canAccessApp(billing).allowed,
                can_create_resources: canCreateResources(billing).allowed,
                can_execute_tasks: canExecuteTasks(billing).allowed,
            },
        })
    } catch (error: unknown) {
        console.error('[GET /api/billing/status] Erro inesperado:', error)
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        )
    }
}
