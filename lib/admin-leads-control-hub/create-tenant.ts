import type { SupabaseClient } from '@supabase/supabase-js'
import { getTrialConfig } from './trial-config'
import { getTrialEndsAtIso } from '@/lib/billing/trial'

export interface CreateTenantArgs {
    supabaseAdmin: SupabaseClient
    userId: string
    userEmail: string
    userName: string
    accountName: string
    restaurantName: string
    customFields: Record<string, unknown>
}

export interface CreateTenantResult {
    accountId: string
    restaurantId: string
    accountName: string
    subscriptionId: string
    trialEndsAt: string
    trialPlanCode: 'A' | 'B' | 'C' | 'D'
    trialDays: number
}

function generateSlug(name: string): string {
    const base = name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    const suffix = Math.random().toString(36).slice(2, 6)
    return `${base}-${suffix}`
}

function pickString(fields: Record<string, unknown>, key: string): string | null {
    const v = fields[key]
    if (typeof v !== 'string') return null
    const trimmed = v.trim()
    return trimmed.length > 0 ? trimmed : null
}

export async function createAccountWithRestaurant(
    args: CreateTenantArgs
): Promise<CreateTenantResult> {
    const { supabaseAdmin, userId, userEmail, userName, accountName, restaurantName, customFields } = args

    const trial = getTrialConfig()
    const { data: planRow, error: planErr } = await supabaseAdmin
        .from('plans')
        .select('id, code')
        .eq('code', trial.planCode)
        .eq('active', true)
        .maybeSingle<{ id: string; code: string }>()
    if (planErr || !planRow) {
        throw new Error(
            `Plano trial "${trial.planCode}" não encontrado/ativo (LEAD_TRIAL_PLAN_CODE).`
        )
    }

    await supabaseAdmin
        .from('users')
        .upsert({ id: userId, email: userEmail, name: userName }, { onConflict: 'id' })

    const { data: accountData, error: accountErr } = await supabaseAdmin
        .from('accounts')
        .insert({ name: accountName })
        .select('id, name')
        .single<{ id: string; name: string }>()
    if (accountErr || !accountData) {
        throw new Error(`Falha ao criar account: ${accountErr?.message ?? 'unknown'}`)
    }
    const accountId = accountData.id

    const rollbackAccount = async () => {
        await supabaseAdmin.from('accounts').delete().eq('id', accountId)
    }

    const { error: accountUserErr } = await supabaseAdmin.from('account_users').insert({
        account_id: accountId,
        user_id: userId,
        role: 'owner',
        active: true,
    })
    if (accountUserErr) {
        await rollbackAccount()
        throw new Error(`Falha ao vincular owner à account: ${accountUserErr.message}`)
    }

    const cnpj = pickString(customFields, 'cnpj')
    const phone = pickString(customFields, 'phone')
    const cep = pickString(customFields, 'cep')
    const address = pickString(customFields, 'address')

    const { data: restaurantData, error: restaurantErr } = await supabaseAdmin
        .from('restaurants')
        .insert({
            name: restaurantName,
            slug: generateSlug(restaurantName),
            owner_id: userId,
            account_id: accountId,
            is_primary: true,
            cnpj,
            phone,
            cep,
            address,
        })
        .select('id')
        .single<{ id: string }>()
    if (restaurantErr || !restaurantData) {
        await supabaseAdmin.from('account_users').delete().eq('account_id', accountId)
        await rollbackAccount()
        throw new Error(`Falha ao criar restaurant: ${restaurantErr?.message ?? 'unknown'}`)
    }
    const restaurantId = restaurantData.id

    const { error: restaurantUserErr } = await supabaseAdmin.from('restaurant_users').insert({
        restaurant_id: restaurantId,
        user_id: userId,
        role: 'owner',
        active: true,
    })
    if (restaurantUserErr) {
        await supabaseAdmin.from('restaurants').delete().eq('id', restaurantId)
        await supabaseAdmin.from('account_users').delete().eq('account_id', accountId)
        await rollbackAccount()
        throw new Error(`Falha ao vincular owner ao restaurant: ${restaurantUserErr.message}`)
    }

    // started_at = timestamp do registro (não "início do trial" no sentido comercial).
    // Em conversão paga / upgrade, criar nova subscription em vez de mutar esta.
    const trialEndsAt = getTrialEndsAtIso(trial.trialDays)
    const { data: subData, error: subErr } = await supabaseAdmin
        .from('subscriptions')
        .insert({
            account_id: accountId,
            plan_id: planRow.id,
            billing_cycle: 'monthly',
            status: 'trial',
            ends_at: trialEndsAt,
        })
        .select('id')
        .single<{ id: string }>()
    if (subErr || !subData) {
        await supabaseAdmin.from('restaurant_users').delete().eq('restaurant_id', restaurantId)
        await supabaseAdmin.from('restaurants').delete().eq('id', restaurantId)
        await supabaseAdmin.from('account_users').delete().eq('account_id', accountId)
        await rollbackAccount()
        throw new Error(`Falha ao criar subscription trial: ${subErr?.message ?? 'unknown'}`)
    }

    return {
        accountId,
        restaurantId,
        accountName: accountData.name,
        subscriptionId: subData.id,
        trialEndsAt,
        trialPlanCode: trial.planCode,
        trialDays: trial.trialDays,
    }
}
