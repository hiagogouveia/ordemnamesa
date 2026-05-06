import 'server-only'
import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'

const DAY_MS = 86_400_000

function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * DAY_MS).toISOString()
}

interface RawEventRow {
    event_name: string
    event_category: string
    restaurant_id: string | null
    account_id: string | null
    user_id: string | null
    created_at: string
}

export interface RestaurantEngagement {
    restaurant_id: string
    events_last_7d: number
    events_last_30d: number
    distinct_users_last_7d: number
    last_event_at: string | null
    has_first_checklist: boolean
    has_first_task_completed: boolean
}

/**
 * Carrega engagement signals para uma lista de restaurant_ids.
 *
 * Estratégia em camadas (resolve dados pré-deploy do tracking):
 *   - Janela de 30d em event_logs para events_7d/events_30d/users_7d
 *   - Fallback A: has_first_checklist e has_first_task_completed também são
 *     derivados das tabelas operacionais (checklists, task_executions),
 *     garantindo que onboarding histórico anterior ao tracking seja reconhecido
 *   - Fallback B: last_event_at = MAX(event_logs, checklist_assumptions,
 *     task_executions) — janela de 90d para fallback
 */
export async function getRestaurantEngagementBatch(
    restaurantIds: string[]
): Promise<Map<string, RestaurantEngagement>> {
    const out = new Map<string, RestaurantEngagement>()
    if (restaurantIds.length === 0) return out

    const since30d = isoDaysAgo(30)
    const since90d = isoDaysAgo(90)

    const [eventsResp, checklistsResp, doneTasksResp, recentAssumptionsResp, recentDoneTasksResp] =
        await Promise.all([
            supabaseAdmin
                .from('event_logs')
                .select('event_name, event_category, restaurant_id, user_id, created_at')
                .in('restaurant_id', restaurantIds)
                .gte('created_at', since30d),
            supabaseAdmin
                .from('checklists')
                .select('restaurant_id')
                .in('restaurant_id', restaurantIds),
            supabaseAdmin
                .from('task_executions')
                .select('restaurant_id')
                .in('restaurant_id', restaurantIds)
                .eq('status', 'done')
                .limit(50_000),
            supabaseAdmin
                .from('checklist_assumptions')
                .select('restaurant_id, assumed_at')
                .in('restaurant_id', restaurantIds)
                .gte('assumed_at', since90d),
            supabaseAdmin
                .from('task_executions')
                .select('restaurant_id, executed_at')
                .in('restaurant_id', restaurantIds)
                .eq('status', 'done')
                .gte('executed_at', since90d),
        ])

    const events = (eventsResp.data ?? []) as Array<
        Pick<RawEventRow, 'event_name' | 'event_category' | 'restaurant_id' | 'user_id' | 'created_at'>
    >
    const checklistRows = (checklistsResp.data ?? []) as Array<{ restaurant_id: string | null }>
    const doneTasksRows = (doneTasksResp.data ?? []) as Array<{ restaurant_id: string | null }>
    const recentAssumptions = (recentAssumptionsResp.data ?? []) as Array<{
        restaurant_id: string | null
        assumed_at: string
    }>
    const recentDoneTasks = (recentDoneTasksResp.data ?? []) as Array<{
        restaurant_id: string | null
        executed_at: string | null
    }>

    const since7dMs = Date.now() - 7 * DAY_MS

    for (const id of restaurantIds) {
        out.set(id, {
            restaurant_id: id,
            events_last_7d: 0,
            events_last_30d: 0,
            distinct_users_last_7d: 0,
            last_event_at: null,
            has_first_checklist: false,
            has_first_task_completed: false,
        })
    }

    // Fallback A — onboarding histórico via tabelas operacionais
    const checklistRestaurants = new Set(
        checklistRows.map((r) => r.restaurant_id).filter((x): x is string => !!x)
    )
    const doneTaskRestaurants = new Set(
        doneTasksRows.map((r) => r.restaurant_id).filter((x): x is string => !!x)
    )
    for (const id of restaurantIds) {
        const cur = out.get(id)
        if (!cur) continue
        if (checklistRestaurants.has(id)) cur.has_first_checklist = true
        if (doneTaskRestaurants.has(id)) cur.has_first_task_completed = true
    }

    // Métricas de event_logs (events_7d/30d, users_7d) — fontes específicas
    const usersBy7d = new Map<string, Set<string>>()
    for (const ev of events) {
        if (!ev.restaurant_id) continue
        const cur = out.get(ev.restaurant_id)
        if (!cur) continue
        cur.events_last_30d += 1
        if (!cur.last_event_at || ev.created_at > cur.last_event_at) cur.last_event_at = ev.created_at
        if (Date.parse(ev.created_at) >= since7dMs) {
            cur.events_last_7d += 1
            if (ev.user_id) {
                let set = usersBy7d.get(ev.restaurant_id)
                if (!set) {
                    set = new Set()
                    usersBy7d.set(ev.restaurant_id, set)
                }
                set.add(ev.user_id)
            }
        }
        // Fallback A reforço — eventos também sinalizam onboarding
        if (ev.event_name === 'checklist_created') cur.has_first_checklist = true
        if (ev.event_name === 'task_completed') cur.has_first_task_completed = true
    }
    for (const [rid, set] of usersBy7d) {
        const cur = out.get(rid)
        if (cur) cur.distinct_users_last_7d = set.size
    }

    // Fallback B — last_event_at e WAU consideram atividade operacional real
    const since7dIso = isoDaysAgo(7)
    const fallbackUsersResp = await supabaseAdmin
        .from('checklist_assumptions')
        .select('restaurant_id, user_id, assumed_at')
        .in('restaurant_id', restaurantIds)
        .gte('assumed_at', since7dIso)
    const fallbackUsersRows = (fallbackUsersResp.data ?? []) as Array<{
        restaurant_id: string | null
        user_id: string | null
        assumed_at: string
    }>
    const fallbackUsersBy7d = new Map<string, Set<string>>()
    for (const u of fallbackUsersRows) {
        if (!u.restaurant_id || !u.user_id) continue
        let set = fallbackUsersBy7d.get(u.restaurant_id)
        if (!set) {
            set = new Set()
            fallbackUsersBy7d.set(u.restaurant_id, set)
        }
        set.add(u.user_id)
    }
    for (const a of recentAssumptions) {
        if (!a.restaurant_id) continue
        const cur = out.get(a.restaurant_id)
        if (!cur) continue
        if (!cur.last_event_at || a.assumed_at > cur.last_event_at) {
            cur.last_event_at = a.assumed_at
        }
    }
    for (const t of recentDoneTasks) {
        if (!t.restaurant_id || !t.executed_at) continue
        const cur = out.get(t.restaurant_id)
        if (!cur) continue
        if (!cur.last_event_at || t.executed_at > cur.last_event_at) {
            cur.last_event_at = t.executed_at
        }
    }
    // distinct_users_last_7d só faz fallback se event_logs não trouxe nada — assim
    // mantemos a precisão do tracking quando ele estiver ativo, e não pioramos o
    // sinal quando ele estiver vazio.
    for (const [rid, set] of fallbackUsersBy7d) {
        const cur = out.get(rid)
        if (!cur) continue
        if (cur.distinct_users_last_7d === 0) cur.distinct_users_last_7d = set.size
    }

    return out
}

export interface DauPoint {
    date: string // YYYY-MM-DD
    distinct_users: number
}

export async function getDauTimeseries(days = 14): Promise<DauPoint[]> {
    const since = isoDaysAgo(days)
    const { data } = await supabaseAdmin
        .from('event_logs')
        .select('user_id, created_at')
        .gte('created_at', since)
        .not('user_id', 'is', null)

    const rows = (data ?? []) as Array<{ user_id: string | null; created_at: string }>
    const buckets = new Map<string, Set<string>>()
    for (const ev of rows) {
        if (!ev.user_id) continue
        const day = ev.created_at.slice(0, 10)
        let set = buckets.get(day)
        if (!set) {
            set = new Set()
            buckets.set(day, set)
        }
        set.add(ev.user_id)
    }
    const result: DauPoint[] = []
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10)
        result.push({ date: d, distinct_users: buckets.get(d)?.size ?? 0 })
    }
    return result
}

export interface ActivationFunnel {
    restaurants_total: number
    with_first_checklist: number
    with_first_task: number
}

export async function getActivationFunnel(): Promise<ActivationFunnel> {
    const [total, checklists, tasks] = await Promise.all([
        supabaseAdmin
            .from('restaurants')
            .select('id', { count: 'exact', head: true })
            .is('deleted_at', null),
        supabaseAdmin.from('event_logs').select('restaurant_id').eq('event_name', 'checklist_created'),
        supabaseAdmin.from('event_logs').select('restaurant_id').eq('event_name', 'task_completed'),
    ])

    const checklistRows = (checklists.data ?? []) as Array<{ restaurant_id: string | null }>
    const taskRows = (tasks.data ?? []) as Array<{ restaurant_id: string | null }>
    const checklistRestaurants = new Set(
        checklistRows.map((r) => r.restaurant_id).filter((id): id is string => !!id)
    )
    const taskRestaurants = new Set(
        taskRows.map((r) => r.restaurant_id).filter((id): id is string => !!id)
    )
    return {
        restaurants_total: total.count ?? 0,
        with_first_checklist: checklistRestaurants.size,
        with_first_task: taskRestaurants.size,
    }
}

export interface ChurnRiskRestaurant {
    restaurant_id: string
    days_since_last_event: number | null
}

export async function getChurnRiskCandidates(
    inactiveDays = 14,
    limit = 50
): Promise<ChurnRiskRestaurant[]> {
    const { data } = await supabaseAdmin
        .from('event_logs')
        .select('restaurant_id, created_at')
        .not('restaurant_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000)

    const rows = (data ?? []) as Array<{ restaurant_id: string | null; created_at: string }>
    const last = new Map<string, string>()
    for (const ev of rows) {
        if (!ev.restaurant_id) continue
        if (!last.has(ev.restaurant_id)) last.set(ev.restaurant_id, ev.created_at)
    }

    const now = Date.now()
    const result: ChurnRiskRestaurant[] = []
    for (const [rid, lastAt] of last) {
        const days = Math.floor((now - Date.parse(lastAt)) / DAY_MS)
        if (days >= inactiveDays) result.push({ restaurant_id: rid, days_since_last_event: days })
    }
    return result.sort((a, b) => (b.days_since_last_event ?? 0) - (a.days_since_last_event ?? 0)).slice(0, limit)
}
