import crypto from 'crypto'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase-admin'
import { createAccountWithRestaurant } from './create-tenant'
import type { Lead } from './types'

export interface ProvisionResult {
    userId: string
    accountId: string
    restaurantId: string
    accountName: string
    subscriptionId: string
    isNewUser: boolean
    trialEndsAt: string
    trialPlanCode: 'A' | 'B' | 'C' | 'D'
    trialDays: number
}

function generateThrowawayPassword(): string {
    return crypto.randomBytes(24).toString('base64url') + 'Aa1!'
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase()

    const { data: internal } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', normalized)
        .maybeSingle<{ id: string }>()

    if (internal?.id) {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(internal.id)
        if (!error && data?.user) return data.user
    }

    return null
}

async function findOrCreateAuthUser(
    email: string,
    fullName: string
): Promise<{ userId: string; isNewUser: boolean }> {
    const normalized = email.toLowerCase()
    const existing = await findAuthUserByEmail(normalized)
    if (existing) return { userId: existing.id, isNewUser: false }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: normalized,
        password: generateThrowawayPassword(),
        email_confirm: true,
        user_metadata: { full_name: fullName },
    })
    if (error || !data?.user) {
        throw new Error(`Falha ao criar usuário: ${error?.message ?? 'unknown'}`)
    }
    return { userId: data.user.id, isNewUser: true }
}

export async function provisionLeadAccount(input: {
    lead: Lead
}): Promise<ProvisionResult> {
    const { lead } = input

    const { userId, isNewUser } = await findOrCreateAuthUser(lead.email, lead.name)

    try {
        const tenant = await createAccountWithRestaurant({
            supabaseAdmin,
            userId,
            userEmail: lead.email.toLowerCase(),
            userName: lead.name,
            accountName: lead.organization_name,
            restaurantName: lead.organization_name,
            customFields: lead.custom_fields,
        })

        return {
            userId,
            accountId: tenant.accountId,
            restaurantId: tenant.restaurantId,
            accountName: tenant.accountName,
            subscriptionId: tenant.subscriptionId,
            isNewUser,
            trialEndsAt: tenant.trialEndsAt,
            trialPlanCode: tenant.trialPlanCode,
            trialDays: tenant.trialDays,
        }
    } catch (err) {
        if (isNewUser) {
            await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
        }
        throw err
    }
}
