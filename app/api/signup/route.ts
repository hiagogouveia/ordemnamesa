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

        // 7. Criar restaurante + vínculo owner via RPC (transação atômica)
        const { error: rpcError } = await adminSupabase.rpc('signup_create_restaurant', {
            p_user_id: newUserId,
            p_email: email.trim(),
            p_name: nome_responsavel.trim(),
            p_rest_name: nome_fantasia.trim(),
            p_rest_slug: slug,
            p_cnpj: cnpjDigits,
            p_phone: telefoneDigits,
            p_cep: cepDigits,
            p_address: endereco.trim(),
        })

        if (rpcError) {
            // Compensating action: remover auth user para evitar registro órfão
            await adminSupabase.auth.admin.deleteUser(newUserId)
            newUserId = null

            const msg = rpcError.message.toLowerCase()
            if (msg.includes('restaurants_cnpj_key')) {
                return NextResponse.json({ error: 'CNPJ já cadastrado.' }, { status: 409 })
            }
            throw rpcError
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
