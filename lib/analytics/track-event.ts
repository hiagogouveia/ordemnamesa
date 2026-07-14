import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type EventCategory = 'auth' | 'onboarding' | 'usage' | 'engagement' | 'admin'

export type AuthEventName =
    | 'login_success'
    | 'login_failed'
    | 'password_reset_requested'
    | 'password_reset_completed'

export type OnboardingEventName = 'restaurant_created'

export type UsageEventName =
    | 'checklist_created'
    | 'checklist_completed'
    | 'task_completed'
    | 'photo_uploaded'

export type AdminEventName =
    | 'account_suspended'
    | 'account_reactivated'
    | 'trial_extended'
    | 'plan_changed'
    | 'vip_toggled'
    | 'manual_password_reset'
    | 'manual_password_set'
    | 'lead_approved'
    | 'lead_rejected'
    | 'checklist_responsible_transferred'

/**
 * s90 — auditoria da navegação por notificação, correlacionada por `event_id`.
 *
 * A razão de existir: a métrica que define se o deep-link é de fato determinístico é
 * `navigation_failed / clicked`, que deve ficar ≈ 0 (exceto rotinas genuinamente
 * excluídas). Sem estes eventos, "o gestor caiu na tela errada" é indiagnosticável.
 */
export type NotificationEventName =
    | 'notification_clicked'
    | 'notification_navigation_succeeded'
    | 'notification_navigation_failed'

export type EventName =
    | AuthEventName
    | OnboardingEventName
    | UsageEventName
    | AdminEventName
    | NotificationEventName

export interface TrackEventInput {
    eventName: EventName
    category: EventCategory
    accountId?: string | null
    restaurantId?: string | null
    userId?: string | null
    metadata?: Record<string, unknown>
}

let _client: SupabaseClient | null = null

function getAnalyticsClient(): SupabaseClient | null {
    if (_client) return _client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    _client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    return _client
}

/**
 * Insere um event_log. Falha silenciosa: NUNCA propaga erro para o fluxo
 * principal — analytics não pode quebrar features.
 */
export async function trackEvent(input: TrackEventInput): Promise<void> {
    try {
        const client = getAnalyticsClient()
        if (!client) {
            console.warn('[analytics] supabase env missing; event dropped:', input.eventName)
            return
        }
        const { error } = await client.from('event_logs').insert({
            event_name: input.eventName,
            event_category: input.category,
            account_id: input.accountId ?? null,
            restaurant_id: input.restaurantId ?? null,
            user_id: input.userId ?? null,
            metadata: input.metadata ?? {},
        })
        if (error) console.error('[analytics] insert failed', error.message)
    } catch (err) {
        console.error('[analytics] unexpected error', err)
    }
}

// ---------- Helpers por categoria ----------

export interface BaseContext {
    accountId?: string | null
    restaurantId?: string | null
    userId?: string | null
    metadata?: Record<string, unknown>
}

export function trackAuthEvent(
    eventName: AuthEventName,
    ctx: BaseContext = {}
): Promise<void> {
    return trackEvent({ eventName, category: 'auth', ...ctx })
}

export function trackOnboardingEvent(
    eventName: OnboardingEventName,
    ctx: BaseContext = {}
): Promise<void> {
    return trackEvent({ eventName, category: 'onboarding', ...ctx })
}

export function trackChecklistEvent(
    eventName: UsageEventName,
    ctx: BaseContext = {}
): Promise<void> {
    return trackEvent({ eventName, category: 'usage', ...ctx })
}

export function trackAdminEvent(
    eventName: AdminEventName,
    ctx: BaseContext = {}
): Promise<void> {
    return trackEvent({ eventName, category: 'admin', ...ctx })
}
