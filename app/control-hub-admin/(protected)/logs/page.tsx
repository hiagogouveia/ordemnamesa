import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'

export const dynamic = 'force-dynamic'

interface LogRow {
    id: string
    admin_email: string
    action: string
    target_type: string | null
    target_id: string | null
    metadata: Record<string, unknown>
    ip_address: string | null
    created_at: string
}

export default async function LogsPage() {
    const { data } = await supabaseAdmin
        .from('admin_logs')
        .select('id, admin_email, action, target_type, target_id, metadata, ip_address, created_at')
        .order('created_at', { ascending: false })
        .limit(100)

    const logs = (data ?? []) as LogRow[]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-white">Logs administrativos</h1>
                <p className="text-sm text-text-secondary">Últimos 100 registros</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-border-dark text-left text-xs uppercase tracking-wider text-text-secondary">
                            <tr>
                                <th className="px-4 py-3 font-bold">Quando</th>
                                <th className="px-4 py-3 font-bold">Admin</th>
                                <th className="px-4 py-3 font-bold">Ação</th>
                                <th className="px-4 py-3 font-bold">Alvo</th>
                                <th className="px-4 py-3 font-bold">IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-text-secondary">
                                        Sem registros.
                                    </td>
                                </tr>
                            )}
                            {logs.map((l) => (
                                <tr key={l.id} className="border-b border-border-dark last:border-0 hover:bg-surface-deep/30">
                                    <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                                        {new Date(l.created_at).toLocaleString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-3 text-white">{l.admin_email}</td>
                                    <td className="px-4 py-3">
                                        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                                            {l.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-text-secondary">
                                        {l.target_type ? `${l.target_type}:${l.target_id?.slice(0, 8)}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-text-secondary">{l.ip_address ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
