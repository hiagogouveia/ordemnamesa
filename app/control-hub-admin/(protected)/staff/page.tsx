import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { StaffForm } from './staff-form'
import { RemoveStaffButton } from './remove-staff-button'

export const dynamic = 'force-dynamic'

interface StaffRow {
    id: string
    user_id: string
    role: 'SUPER_ADMIN' | 'SUPPORT_AGENT'
    created_at: string
    created_by: string
    email?: string
}

export default async function StaffPage() {
    const guard = await requireStaff()
    const isSuperAdmin = 'ctx' in guard && guard.ctx.role === 'SUPER_ADMIN'

    const { data: staffRaw } = await supabaseAdmin
        .from('ordemnamesa_staff')
        .select('id, user_id, role, created_at, created_by')
        .order('created_at', { ascending: false })

    const staff = (staffRaw ?? []) as StaffRow[]

    if (staff.length > 0) {
        const { data: emails } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })
        const map = new Map(emails?.users.map((u) => [u.id, u.email ?? '']))
        for (const s of staff) {
            s.email = map.get(s.user_id) ?? '—'
        }
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-black text-white">Staff</h1>

            {isSuperAdmin ? (
                <div className="rounded-2xl border border-border-dark bg-surface-dark p-6">
                    <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">
                        Adicionar membro
                    </h2>
                    <StaffForm />
                </div>
            ) : (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                    Apenas SUPER_ADMIN pode editar staff.
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-border-dark text-left text-xs uppercase tracking-wider text-text-secondary">
                            <tr>
                                <th className="px-4 py-3 font-bold">Email</th>
                                <th className="px-4 py-3 font-bold">Role</th>
                                <th className="px-4 py-3 font-bold">Adicionado em</th>
                                <th className="px-4 py-3 font-bold">Por</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {staff.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-text-secondary">
                                        Nenhum membro além da whitelist ENV.
                                    </td>
                                </tr>
                            )}
                            {staff.map((s) => (
                                <tr key={s.id} className="border-b border-border-dark last:border-0 hover:bg-surface-deep/30">
                                    <td className="px-4 py-3 text-white">{s.email}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={
                                                s.role === 'SUPER_ADMIN'
                                                    ? 'rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary'
                                                    : 'rounded-md border border-border-dark bg-surface-deep px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary'
                                            }
                                        >
                                            {s.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-text-secondary">
                                        {new Date(s.created_at).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-3 text-text-secondary">{s.created_by}</td>
                                    <td className="px-4 py-3 text-right">
                                        {isSuperAdmin && <RemoveStaffButton staffId={s.id} />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
