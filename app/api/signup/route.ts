import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Rate limiting (in-memory, por IP) ─────────────────────
const rateLimit = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000 // 1 minuto
const MAX_REQUESTS = 5

function checkRateLimit(ip: string): boolean {
    const now = Date.now()
    const entry = rateLimit.get(ip)
    if (!entry || now > entry.resetAt) {
        rateLimit.set(ip, { count: 1, resetAt: now + WINDOW_MS })
        return true
    }
    if (entry.count >= MAX_REQUESTS) return false
    entry.count++
    return true
}

// ── Supabase admin client (service role, bypassa RLS) ─────
const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

// ── Utilitários ───────────────────────────────────────────
function digitsOnly(value: string): string {
    return value.replace(/\D/g, '')
}

function generateSlug(name: string): string {
    const base = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    const suffix = Math.random().toString(36).slice(2, 6)
    return `${base}-${suffix}`
}

// ── Tipos internos ────────────────────────────────────────
interface SignupBody {
    nome_responsavel: string
    email: string
    senha: string
    nome_fantasia: string
    cnpj: string
    telefone: string
    cep: string
    endereco: string
}

// ── POST /api/signup ──────────────────────────────────────
export async function POST(request: Request) {
    // 1. Rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    if (!checkRateLimit(ip)) {
        return NextResponse.json(
            { error: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.' },
            { status: 429 }
        )
    }

    // 2. Parse + validação de campos obrigatórios
    let body: SignupBody
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
    }

    const { nome_responsavel, email, senha, nome_fantasia, cnpj, telefone, cep, endereco } = body

    if (!nome_responsavel?.trim()) return NextResponse.json({ error: 'Nome do responsável é obrigatório.' }, { status: 400 })
    if (!email?.trim()) return NextResponse.json({ error: 'E-mail é obrigatório.' }, { status: 400 })
    if (!senha) return NextResponse.json({ error: 'Senha é obrigatória.' }, { status: 400 })
    if (senha.length < 6) return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, { status: 400 })
    if (!nome_fantasia?.trim()) return NextResponse.json({ error: 'Nome do restaurante é obrigatório.' }, { status: 400 })
    if (!cnpj) return NextResponse.json({ error: 'CNPJ é obrigatório.' }, { status: 400 })
    if (!telefone) return NextResponse.json({ error: 'Telefone é obrigatório.' }, { status: 400 })
    if (!cep) return NextResponse.json({ error: 'CEP é obrigatório.' }, { status: 400 })
    if (!endereco?.trim()) return NextResponse.json({ error: 'Endereço é obrigatório.' }, { status: 400 })

    // 3. Limpar máscaras
    const cnpjDigits = digitsOnly(cnpj)
    const telefoneDigits = digitsOnly(telefone)
    const cepDigits = digitsOnly(cep)

    // 4. Validações de formato
    if (cnpjDigits.length !== 14) {
        return NextResponse.json({ error: 'CNPJ inválido. Informe os 14 dígitos.' }, { status: 400 })
    }
    if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
        return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
    }
    if (cepDigits.length !== 8) {
        return NextResponse.json({ error: 'CEP inválido.' }, { status: 400 })
    }

    const adminSupabase = getAdminSupabase()
    let newUserId: string | null = null

    try {
        // 5. Criar usuário no Auth
        const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
            email: email.trim(),
            password: senha,
            email_confirm: true,
            user_metadata: { name: nome_responsavel.trim() },
        })

        if (authError) {
            const msg = authError.message.toLowerCase()
            if (msg.includes('already') || msg.includes('exists')) {
                return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
            }
            throw authError
        }

        newUserId = authData.user.id

        // 6. Gerar slug único
        const slug = generateSlug(nome_fantasia.trim())

        // 7. Garantir row em public.users (trigger on_auth_user_created já faz isso,
        //    upsert como safety net caso haja race condition marginal)
        const { error: userRowError } = await adminSupabase
            .from('users')
            .upsert(
                { id: newUserId, email: email.trim(), name: nome_responsavel.trim() },
                { onConflict: 'id' }
            )
        if (userRowError) throw userRowError

        // 8. Criar account (tenant de topo) + vínculo owner
        const { data: accountData, error: accountError } = await adminSupabase
            .from('accounts')
            .insert({ name: nome_fantasia.trim() })
            .select('id')
            .single<{ id: string }>()
        if (accountError || !accountData) {
            throw accountError ?? new Error('Falha ao criar account.')
        }
        const newAccountId = accountData.id

        const { error: accountUserError } = await adminSupabase
            .from('account_users')
            .insert({
                account_id: newAccountId,
                user_id: newUserId,
                role: 'owner',
                active: true,
            })
        if (accountUserError) {
            await adminSupabase.from('accounts').delete().eq('id', newAccountId)
            throw accountUserError
        }

        // 8.5. Criar subscription trial 30d no Plano A
        const { data: planA, error: planErr } = await adminSupabase
            .from('plans')
            .select('id')
            .eq('code', 'A')
            .single<{ id: string }>()
        if (planErr || !planA) {
            await adminSupabase.from('account_users').delete().eq('account_id', newAccountId)
            await adminSupabase.from('accounts').delete().eq('id', newAccountId)
            throw planErr ?? new Error('Plano A não encontrado.')
        }

        const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        const { error: subError } = await adminSupabase
            .from('subscriptions')
            .insert({
                account_id: newAccountId,
                plan_id: planA.id,
                billing_cycle: 'monthly',
                status: 'trial',
                started_at: new Date().toISOString(),
                ends_at: trialEndsAt,
            })
        if (subError) {
            await adminSupabase.from('account_users').delete().eq('account_id', newAccountId)
            await adminSupabase.from('accounts').delete().eq('id', newAccountId)
            throw subError
        }

        // 9. Criar restaurante (vinculado à account) + vínculo owner em restaurant_users
        const { data: restaurantData, error: restaurantError } = await adminSupabase
            .from('restaurants')
            .insert({
                name: nome_fantasia.trim(),
                slug,
                owner_id: newUserId,
                cnpj: cnpjDigits,
                phone: telefoneDigits,
                cep: cepDigits,
                address: endereco.trim(),
                account_id: newAccountId,
                is_primary: true,
            })
            .select('id')
            .single<{ id: string }>()

        if (restaurantError || !restaurantData) {
            await adminSupabase.from('subscriptions').delete().eq('account_id', newAccountId)
            await adminSupabase.from('account_users').delete().eq('account_id', newAccountId)
            await adminSupabase.from('accounts').delete().eq('id', newAccountId)

            const msg = (restaurantError?.message ?? '').toLowerCase()
            if (msg.includes('cnpj')) {
                await adminSupabase.auth.admin.deleteUser(newUserId)
                newUserId = null
                return NextResponse.json({ error: 'CNPJ já cadastrado.' }, { status: 409 })
            }
            throw restaurantError ?? new Error('Falha ao criar restaurante.')
        }

        const { error: restaurantUserError } = await adminSupabase
            .from('restaurant_users')
            .insert({
                restaurant_id: restaurantData.id,
                user_id: newUserId,
                role: 'owner',
                active: true,
            })
        if (restaurantUserError) {
            await adminSupabase.from('restaurants').delete().eq('id', restaurantData.id)
            await adminSupabase.from('subscriptions').delete().eq('account_id', newAccountId)
            await adminSupabase.from('account_users').delete().eq('account_id', newAccountId)
            await adminSupabase.from('accounts').delete().eq('id', newAccountId)
            throw restaurantUserError
        }

        return NextResponse.json({ success: true }, { status: 201 })

    } catch (err: unknown) {
        console.error('[POST /api/signup]', err)

        // Se o auth user foi criado mas algo falhou depois, tentar remover
        if (newUserId) {
            await adminSupabase.auth.admin.deleteUser(newUserId).catch((e: unknown) => {
                console.error('[POST /api/signup] Falha ao remover auth user órfão:', e)
            })
        }

        return NextResponse.json(
            { error: 'Erro interno ao criar conta. Tente novamente.' },
            { status: 500 }
        )
    }
}
