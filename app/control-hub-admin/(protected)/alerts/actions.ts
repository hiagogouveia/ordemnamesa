'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { requireStaff, requireSuperAdmin } from '@/lib/admin-leads-control-hub/staff'
import { logAdminAction } from '@/lib/admin-leads-control-hub/log-admin-action'
import { generateAlerts, type AlertGenerationResult } from '@/lib/automation/generate-alerts'
import { config } from '@/lead-control-hub.config'

export interface AlertActionResult {
    ok?: boolean
    error?: string
    result?: AlertGenerationResult
}

export async function resolveAlertAction(
    alertId: string,
    reason?: string
): Promise<AlertActionResult> {
    const guard = await requireStaff()
    if ('error' in guard) return { error: guard.error }

    const { data: alert } = await supabaseAdmin
        .from('operational_alerts')
        .select('id, restaurant_id, alert_type, resolved_at')
        .eq('id', alertId)
        .maybeSingle<{ id: string; restaurant_id: string | null; alert_type: string; resolved_at: string | null }>()
    if (!alert) return { error: 'Alerta não encontrado.' }
    if (alert.resolved_at) return { error: 'Alerta já está resolvido.' }

    const adminEmail = guard.ctx.user.email!.toLowerCase()
    const { error } = await supabaseAdmin
        .from('operational_alerts')
        .update({
            resolved_at: new Date().toISOString(),
            resolved_by: adminEmail,
            resolution_reason: reason?.trim() || null,
        })
        .eq('id', alertId)
    if (error) return { error: `Falha ao resolver: ${error.message}` }

    const h = await headers()
    await logAdminAction({
        adminEmail,
        action: 'resolve_alert',
        targetType: 'alert',
        targetId: alertId,
        metadata: {
            alert_type: alert.alert_type,
            restaurant_id: alert.restaurant_id,
            reason: reason?.trim() || null,
        },
        ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
        userAgent: h.get('user-agent') || null,
    })

    revalidatePath(`${config.panelBasePath}/alerts`)
    if (alert.restaurant_id) {
        revalidatePath(`${config.panelBasePath}/restaurants/${alert.restaurant_id}`)
    }
    return { ok: true }
}

export async function runAutomationAction(): Promise<AlertActionResult> {
    const guard = await requireSuperAdmin()
    if ('error' in guard) return { error: guard.error }
    const adminEmail = guard.ctx.user.email!.toLowerCase()

    let result: AlertGenerationResult
    try {
        result = await generateAlerts()
    } catch (err) {
        console.error('[runAutomationAction]', err)
        return { error: 'Falha ao executar automação.' }
    }

    await logAdminAction({
        adminEmail,
        action: 'run_alert_automation',
        targetType: 'system',
        targetId: null,
        metadata: result as unknown as Record<string, unknown>,
    })

    revalidatePath(`${config.panelBasePath}/alerts`)
    return { ok: true, result }
}
