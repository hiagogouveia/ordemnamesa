import { supabaseAdmin } from './supabase-admin'
import type { Lead } from './types'

export interface DuplicateMatch {
    id: string
    name: string
}

export interface EmailMatch {
    user_id: string
    email: string
}

export interface DuplicateCheckResult {
    emailMatch: EmailMatch | null
    accountMatches: DuplicateMatch[]
    restaurantMatches: DuplicateMatch[]
}

export function normalizeName(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function isSimilar(a: string, b: string): boolean {
    if (!a || !b) return false
    if (a === b) return true
    const minLen = Math.min(a.length, b.length)
    if (minLen < 4) return false
    if (a.includes(b) || b.includes(a)) {
        const longer = Math.max(a.length, b.length)
        return minLen / longer >= 0.5
    }
    return false
}

async function findSimilarByName(
    table: 'accounts' | 'restaurants',
    normalized: string
): Promise<DuplicateMatch[]> {
    if (!normalized) return []
    const firstToken = normalized.split(' ')[0]
    if (!firstToken || firstToken.length < 3) return []

    const { data, error } = await supabaseAdmin
        .from(table)
        .select('id, name')
        .ilike('name', `${firstToken}%`)
        .limit(50)
    if (error || !data) return []

    return (data as Array<{ id: string; name: string }>)
        .filter((row) => isSimilar(normalizeName(row.name ?? ''), normalized))
        .slice(0, 5)
}

async function findEmailMatch(email: string): Promise<EmailMatch | null> {
    const normalizedEmail = email.toLowerCase().trim()
    if (!normalizedEmail) return null
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .eq('email', normalizedEmail)
        .limit(1)
        .maybeSingle<{ id: string; email: string }>()
    if (error || !data) return null
    return { user_id: data.id, email: data.email }
}

export async function checkLeadDuplicates(
    lead: Pick<Lead, 'email' | 'organization_name'>
): Promise<DuplicateCheckResult> {
    const normalizedOrg = normalizeName(lead.organization_name ?? '')
    const [emailMatch, accountMatches, restaurantMatches] = await Promise.all([
        findEmailMatch(lead.email),
        findSimilarByName('accounts', normalizedOrg),
        findSimilarByName('restaurants', normalizedOrg),
    ])
    return { emailMatch, accountMatches, restaurantMatches }
}

export function hasBlockingDuplicates(result: DuplicateCheckResult): boolean {
    return result.accountMatches.length > 0 || result.restaurantMatches.length > 0
}
