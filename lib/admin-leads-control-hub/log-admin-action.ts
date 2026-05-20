import { supabaseAdmin } from './supabase-admin'

export type AdminAction =
    | 'approve_lead'
    | 'reject_lead'
    | 'mark_contacted'
    | 'login_attempt'
    | 'create_staff'
    | 'update_staff_role'
    | 'reset_staff_password'
    | 'delete_staff'
    | 'manual_password_reset'
    | 'trial_created'
    | string

export async function logAdminAction(args: {
    adminEmail: string
    action: AdminAction
    targetType?: string
    targetId?: string | null
    metadata?: Record<string, unknown>
    ipAddress?: string | null
    userAgent?: string | null
}): Promise<void> {
    const { error } = await supabaseAdmin.from('admin_logs').insert({
        admin_email: args.adminEmail,
        action: args.action,
        target_type: args.targetType ?? null,
        target_id: args.targetId ?? null,
        metadata: args.metadata ?? {},
        ip_address: args.ipAddress ?? null,
        user_agent: args.userAgent ?? null,
    })
    if (error) console.error('[admin_logs] insert failed', error)
}

export async function countRecentLoginAttempts(
    email: string,
    windowMinutes = 15
): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
    const { count, error } = await supabaseAdmin
        .from('admin_logs')
        .select('id', { count: 'exact', head: true })
        .eq('admin_email', email.toLowerCase())
        .eq('action', 'login_attempt')
        .gte('created_at', since)
    if (error) {
        console.error('[admin_logs] count failed', error)
        return 0
    }
    return count ?? 0
}
