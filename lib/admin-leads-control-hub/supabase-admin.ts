import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
    if (_client) return _client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        throw new Error(
            'admin-leads-control-hub: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em runtime.'
        )
    }
    _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return _client
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
        const client = getClient()
        const value = Reflect.get(client, prop, receiver)
        return typeof value === 'function' ? value.bind(client) : value
    },
})
