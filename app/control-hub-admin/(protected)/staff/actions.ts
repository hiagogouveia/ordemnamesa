'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireSuperAdmin, type StaffRole } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { config } from '@/lead-control-hub.config'

export interface StaffActionResult {
    ok?: boolean
    error?: string
}

export async function addStaffAction(
    email: string,
    role: StaffRole
): Promise<StaffActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const normalized = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { error: 'E-mail inválido.' }
    }
    if (!['SUPER_ADMIN', 'SUPPORT_AGENT'].includes(role)) {
        return { error: 'Role inválida.' }
    }

    let userId: string | null = null
    let page = 1
    while (page <= 25) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
        if (error) return { error: 'Falha ao buscar usuário.' }
        const found = data.users.find((u) => (u.email ?? '').toLowerCase() === normalized)
        if (found) {
            userId = found.id
            break
        }
        if (data.users.length < 200) break
        page += 1
    }
    if (!userId) return { error: 'Usuário não encontrado em auth.users. Crie a conta primeiro.' }

    const { error } = await supabaseAdmin
        .from('ordemnamesa_staff')
        .insert({ user_id: userId, role, created_by: guard.ctx.user.email ?? 'unknown' })
    if (error) {
        if (error.message.includes('duplicate')) return { error: 'Usuário já está no staff.' }
        return { error: `Falha ao adicionar: ${error.message}` }
    }

    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'create_staff',
        targetType: 'user',
        targetId: userId,
        metadata: { role, email: normalized },
    })

    revalidatePath(`${config.panelBasePath}/staff`)
    return { ok: true }
}

export async function removeStaffAction(staffId: string): Promise<StaffActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }

    const { data: target } = await supabaseAdmin
        .from('ordemnamesa_staff')
        .select('user_id')
        .eq('id', staffId)
        .single<{ user_id: string }>()
    if (target?.user_id === guard.ctx.user.id) {
        return { error: 'Você não pode remover a si mesmo.' }
    }

    const { error } = await supabaseAdmin
        .from('ordemnamesa_staff')
        .delete()
        .eq('id', staffId)
    if (error) return { error: 'Falha ao remover.' }

    await logAdminAction({
        adminEmail: guard.ctx.user.email!.toLowerCase(),
        action: 'delete_staff',
        targetType: 'staff',
        targetId: staffId,
    })

    revalidatePath(`${config.panelBasePath}/staff`)
    return { ok: true }
}
