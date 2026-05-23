import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { listUserAccountIds } from "@/lib/supabase/accounts"
import { countUnits, countManagers, countStaff } from "@/lib/billing/queries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * GET /api/billing/usage
 *
 * Uso atual da account para comparar com limites de plano (ex.: pré-validação
 * de downgrade). account resolvida server-side. Read-only.
 *
 * Retorna:
 *  - units: unidades ativas
 *  - managers: managers distintos na account
 *  - max_staff_per_unit: maior nº de staff numa única unidade (limite é por unidade)
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization")
        if (!authHeader) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
        const token = authHeader.replace("Bearer ", "")
        const admin = getAdminSupabase()

        const {
            data: { user },
            error: userError,
        } = await admin.auth.getUser(token)
        if (userError || !user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })

        const accountIds = await listUserAccountIds(admin, user.id)
        if (accountIds.length === 0) {
            return NextResponse.json({ error: "Usuário não pertence a nenhuma account." }, { status: 404 })
        }
        let accountId: string
        if (accountIds.length === 1) {
            accountId = accountIds[0]
        } else {
            const { searchParams } = new URL(request.url)
            const requested = searchParams.get("account_id") ?? request.headers.get("x-account-id") ?? null
            if (!requested) return NextResponse.json({ error: "Múltiplas accounts. Informe account_id." }, { status: 400 })
            if (!accountIds.includes(requested)) {
                return NextResponse.json({ error: "Account não pertence ao usuário." }, { status: 403 })
            }
            accountId = requested
        }

        // Guard owner-only: pré-validação de downgrade é função de billing.
        const { data: ownerCheck } = await admin
            .from('account_users')
            .select('role, active')
            .eq('account_id', accountId)
            .eq('user_id', user.id)
            .maybeSingle<{ role: string; active: boolean }>()
        if (!ownerCheck || !ownerCheck.active || ownerCheck.role !== 'owner') {
            return NextResponse.json(
                { error: 'Apenas o proprietário da conta pode gerenciar billing.', code: 'forbidden_billing' },
                { status: 403 }
            )
        }

        const [units, managers] = await Promise.all([
            countUnits(admin, accountId),
            countManagers(admin, accountId),
        ])

        // Maior staff em uma única unidade (o limite max_staff_per_unit é por unidade).
        const { data: unitRows } = await admin
            .from("restaurants")
            .select("id")
            .eq("account_id", accountId)
            .eq("active", true)
            .is("deleted_at", null)
            .returns<Array<{ id: string }>>()

        let maxStaffPerUnit = 0
        for (const u of unitRows ?? []) {
            const n = await countStaff(admin, u.id)
            if (n > maxStaffPerUnit) maxStaffPerUnit = n
        }

        return NextResponse.json({ units, managers, max_staff_per_unit: maxStaffPerUnit })
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}
