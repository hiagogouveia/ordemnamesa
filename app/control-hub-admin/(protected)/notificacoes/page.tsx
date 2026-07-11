import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff } from '@/lib/admin-leads-control-hub/staff'
import { adminNotificationEventLabel } from '@/lib/admin-notifications/events-catalog'
import { RecipientForm } from './recipient-form'
import { RecipientRowActions } from './recipient-row-actions'

export const dynamic = 'force-dynamic'

interface RecipientRow {
    id: string
    email: string
    label: string | null
    active: boolean
    created_by: string | null
    created_at: string
    updated_at: string
}

interface SubscriptionRow {
    recipient_id: string
    event_type: string
}

export default async function NotificacoesPage() {
    const guard = await requireStaff()
    const isSuperAdmin = 'ctx' in guard && guard.ctx.role === 'SUPER_ADMIN'

    const { data: recipientsRaw } = await supabaseAdmin
        .from('admin_notification_recipients')
        .select('id, email, label, active, created_by, created_at, updated_at')
        .order('created_at', { ascending: false })

    const recipients = (recipientsRaw ?? []) as RecipientRow[]

    const { data: subsRaw } = await supabaseAdmin
        .from('admin_notification_subscriptions')
        .select('recipient_id, event_type')

    const eventsByRecipient = new Map<string, string[]>()
    for (const s of (subsRaw ?? []) as SubscriptionRow[]) {
        const list = eventsByRecipient.get(s.recipient_id) ?? []
        list.push(s.event_type)
        eventsByRecipient.set(s.recipient_id, list)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-white">Notificações</h1>
                <p className="mt-1 text-sm text-text-secondary">
                    Destinatários que recebem e-mail quando um novo lead solicita cadastro.
                </p>
            </div>

            {isSuperAdmin ? (
                <div className="rounded-2xl border border-border-dark bg-surface-dark p-6">
                    <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">
                        Adicionar destinatário
                    </h2>
                    <RecipientForm />
                </div>
            ) : (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                    Apenas SUPER_ADMIN pode gerenciar destinatários.
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-border-dark text-left text-xs uppercase tracking-wider text-text-secondary">
                            <tr>
                                <th className="px-4 py-3 font-bold">Destinatário</th>
                                <th className="px-4 py-3 font-bold">Eventos</th>
                                <th className="px-4 py-3 font-bold">Criado por</th>
                                <th className="px-4 py-3 font-bold">Criado em</th>
                                <th className="px-4 py-3 font-bold">Atualizado em</th>
                                {isSuperAdmin && <th className="px-4 py-3 text-right font-bold">Ações</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {recipients.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={isSuperAdmin ? 6 : 5}
                                        className="px-4 py-12 text-center text-text-secondary"
                                    >
                                        Nenhum destinatário cadastrado. Adicione e-mails para receber notificações de novos leads.
                                    </td>
                                </tr>
                            )}
                            {recipients.map((r) => {
                                const events = eventsByRecipient.get(r.id) ?? []
                                return (
                                    <tr
                                        key={r.id}
                                        className="border-b border-border-dark last:border-0 hover:bg-surface-deep/30"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-white">{r.email}</div>
                                            {r.label && (
                                                <div className="text-xs text-text-secondary">{r.label}</div>
                                            )}
                                            {!r.active && (
                                                <span className="mt-1 inline-block rounded-md border border-border-dark bg-surface-deep px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                                                    Inativo
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {events.length === 0 ? (
                                                <span className="text-text-secondary">—</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {events.map((ev) => (
                                                        <span
                                                            key={ev}
                                                            className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                                                        >
                                                            {adminNotificationEventLabel(ev)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary">{r.created_by ?? '—'}</td>
                                        <td className="px-4 py-3 text-text-secondary">
                                            {new Date(r.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary">
                                            {new Date(r.updated_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        {isSuperAdmin && (
                                            <td className="px-4 py-3">
                                                <RecipientRowActions
                                                    recipientId={r.id}
                                                    active={r.active}
                                                    events={events}
                                                />
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
